/**
 * In-memory repository implementations of the import pipeline contracts.
 * Used by unit tests to prove idempotency, duplicate detection and posting
 * gates without a database. NOT used in production paths.
 */

import type {
  BatchRow,
  SourceFileRow,
  StagingRow,
} from "./types";
import { computeContentHash } from "./hashing";
import type {
  ApprovalProbe,
  BatchFindOrCreateInput,
  BatchRepo,
  CatalogRepo,
  ContentProbe,
  IssueDraftInput,
  IssueRepo,
  PipelineDeps,
  PostingGateway,
  PostingResult,
  RawPreserver,
  SourceFileRegisterInput,
  SourceFileRepo,
  StagingRepo,
  StagingUpsertInput,
} from "./repositories";

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${String(seq).padStart(6, "0")}`;
}

export interface MemoryStore {
  sourceFiles: Map<string, SourceFileRow>; // key: company|sha
  batches: Map<string, BatchRow>; // key: idempotencyKey
  staging: Map<string, StagingRow>; // key: batch|lineHash
  issues: Map<string, IssueDraftInput>; // key: batch|code|staging
  approvals: Set<string>; // batch ids with approved posting
  postedContent: Map<string, string>; // contentKey -> record id
  preserved: Set<string>;
  postingCalls: number;
}

export function createMemoryStore(): MemoryStore {
  return {
    sourceFiles: new Map(),
    batches: new Map(),
    staging: new Map(),
    issues: new Map(),
    approvals: new Set(),
    postedContent: new Map(),
    preserved: new Set(),
    postingCalls: 0,
  };
}

export function createMemorySourceFiles(store: MemoryStore): SourceFileRepo {
  return {
    async register(input: SourceFileRegisterInput) {
      const key = `${input.companyId}|${input.contentSha256}`;
      const existing = store.sourceFiles.get(key);
      if (existing) return { file: existing, created: false };
      const file: SourceFileRow = {
        id: nextId("sf"),
        companyId: input.companyId,
        originalFilename: input.originalFilename,
        storageBucket: input.storageBucket,
        storagePath: input.storagePath,
        contentSha256: input.contentSha256,
        byteSize: input.byteSize,
        mimeType: input.mimeType,
        rawPreserved: false,
      };
      store.sourceFiles.set(key, file);
      return { file, created: true };
    },
    async markPreserved(fileId: string) {
      for (const [key, file] of store.sourceFiles) {
        if (file.id === fileId) {
          file.rawPreserved = true;
          store.preserved.add(fileId);
          store.sourceFiles.set(key, file);
          return;
        }
      }
      throw new Error(`source file not found: ${fileId}`);
    },
  };
}

export function createMemoryBatches(store: MemoryStore): BatchRepo {
  return {
    async findOrCreate(input: BatchFindOrCreateInput) {
      const existing = store.batches.get(input.idempotencyKey);
      if (existing) return { batch: existing, created: false };
      const batch: BatchRow = {
        id: nextId("batch"),
        companyId: input.companyId,
        fiscalYearId: input.fiscalYearId,
        sourceFileId: input.sourceFileId,
        pipelineVersion: input.pipelineVersion,
        idempotencyKey: input.idempotencyKey,
        status: "created",
        stage: "source_registered",
        expectedTotals: input.expectedTotals,
        reconciliationSummary: null,
        stats: {},
        errorSummary: null,
        approvalId: null,
      };
      store.batches.set(input.idempotencyKey, batch);
      return { batch, created: true };
    },
    async updateState(batchId, patch) {
      for (const [key, batch] of store.batches) {
        if (batch.id === batchId) {
          if (patch.status !== undefined) batch.status = patch.status;
          if (patch.stage !== undefined) batch.stage = patch.stage;
          if (patch.errorSummary !== undefined) batch.errorSummary = patch.errorSummary;
          if (patch.reconciliationSummary !== undefined)
            batch.reconciliationSummary = patch.reconciliationSummary;
          if (patch.stats !== undefined) batch.stats = patch.stats;
          store.batches.set(key, batch);
          return batch;
        }
      }
      throw new Error(`batch not found: ${batchId}`);
    },
  };
}

export function createMemoryStaging(store: MemoryStore): StagingRepo {
  return {
    async upsert(rows: StagingUpsertInput[]) {
      const out: StagingRow[] = [];
      for (const input of rows) {
        const key = `${input.importBatchId}|${input.sourceLineHash}`;
        const existing = store.staging.get(key);
        if (existing) {
          // re-import: refresh payload/normalized, preserve posted state
          existing.payload = input.payload;
          existing.normalized = input.normalized;
          existing.recordKind = input.recordKind;
          existing.sourceRowNo = input.sourceRowNo;
          store.staging.set(key, existing);
          out.push(existing);
          continue;
        }
        const row: StagingRow = {
          id: nextId("st"),
          companyId: input.companyId,
          fiscalYearId: input.fiscalYearId,
          importBatchId: input.importBatchId,
          recordKind: input.recordKind,
          sourceRowNo: input.sourceRowNo,
          sourceLineHash: input.sourceLineHash,
          payload: input.payload,
          normalized: input.normalized,
          validationStatus: "pending",
          validationErrors: [],
          duplicateStatus: "unknown",
          duplicateOfDocumentId: null,
          postStatus: "pending",
          postedDocumentId: null,
          postedJournalEntryId: null,
        };
        store.staging.set(key, row);
        out.push(row);
      }
      return out;
    },
    async listByBatch(batchId) {
      return [...store.staging.values()].filter((r) => r.importBatchId === batchId);
    },
    async applyValidation(batchId, results) {
      for (const res of results) {
        const key = `${batchId}|${res.sourceLineHash}`;
        const row = store.staging.get(key);
        if (!row) continue;
        row.validationStatus = res.status;
        row.validationErrors = res.errors;
        store.staging.set(key, row);
      }
    },
    async applyDuplicates(batchId, results) {
      for (const res of results) {
        const key = `${batchId}|${res.sourceLineHash}`;
        const row = store.staging.get(key);
        if (!row) continue;
        row.duplicateStatus = res.duplicateStatus;
        row.duplicateOfDocumentId = res.duplicateOfDocumentId;
        store.staging.set(key, row);
      }
    },
  };
}

export function createMemoryIssues(store: MemoryStore): IssueRepo {
  return {
    async syncForBatch(batchId, issues) {
      for (const issue of issues) {
        const key = `${batchId}|${issue.code}|${issue.stagingRecordId ?? ""}`;
        if (!store.issues.has(key)) store.issues.set(key, issue);
      }
    },
    async countOpenErrors(batchId) {
      let n = 0;
      for (const [key, issue] of store.issues) {
        if (key.startsWith(`${batchId}|`) && issue.severity === "error") n += 1;
      }
      return n;
    },
    async listOpenByBatch(batchId) {
      return [...store.issues.entries()]
        .filter(([key]) => key.startsWith(`${batchId}|`))
        .map(([, v]) => v);
    },
  };
}

export function createMemoryCatalog(codes: string[]): CatalogRepo {
  return {
    async listPostableAccountCodes() {
      return new Set(codes);
    },
  };
}

export function createMemoryContentProbe(store: MemoryStore): ContentProbe {
  return {
    async findPostedContent({ companyId, fiscalYearId, kind, contentHash }) {
      return (
        store.postedContent.get(`${companyId}|${fiscalYearId}|${kind}|${contentHash}`) ?? null
      );
    },
  };
}

export function createMemoryApprovals(store: MemoryStore): ApprovalProbe {
  return {
    async hasApprovedImportPosting(batchId) {
      return store.approvals.has(batchId);
    },
  };
}

export function createMemoryPosting(store: MemoryStore): PostingGateway {
  return {
    async postBatch(batchId): Promise<PostingResult> {
      store.postingCalls += 1;
      const batch = [...store.batches.values()].find((b) => b.id === batchId);
      if (!batch) throw new Error(`batch not found: ${batchId}`);
      if (batch.status === "posted") {
        return { alreadyPosted: true, postedJournalEntries: 0, postedDocuments: 0 };
      }
      if (batch.status !== "ready_to_post") {
        throw new Error(`batch not ready: ${batch.status}`);
      }
      if (!store.approvals.has(batchId)) {
        throw new Error("APPROVAL_REQUIRED");
      }
      let entries = 0;
      let docs = 0;
      for (const row of store.staging.values()) {
        if (row.importBatchId !== batchId || row.postStatus !== "pending") continue;
        if (row.recordKind !== "journal_candidate" && row.recordKind !== "document") {
          throw new Error(`UNSUPPORTED_KIND_PENDING: ${row.recordKind}`);
        }
        // Mirror the DB unique content-hash index: identical content posts
        // once; later identical rows are skipped (never duplicated).
        const normalized = row.normalized as unknown as import("./types").NormalizedRecord;
        const contentHash = computeContentHash(normalized);
        const contentKey = `${batch.companyId}|${batch.fiscalYearId}|${row.recordKind}|${contentHash}`;
        const existing = store.postedContent.get(contentKey);
        if (existing) {
          row.postStatus = "skipped";
          if (row.recordKind === "document") row.postedDocumentId = existing;
          else row.postedJournalEntryId = existing;
          continue;
        }
        if (row.recordKind === "journal_candidate") {
          row.postStatus = "posted";
          row.postedJournalEntryId = nextId("je");
          store.postedContent.set(contentKey, row.postedJournalEntryId);
          entries += 1;
        } else {
          row.postStatus = "posted";
          row.postedDocumentId = nextId("doc");
          store.postedContent.set(contentKey, row.postedDocumentId);
          docs += 1;
        }
      }
      batch.status = "posted";
      batch.stage = "posted";
      return { alreadyPosted: false, postedJournalEntries: entries, postedDocuments: docs };
    },
  };
}

export function createMemoryPreserver(store: MemoryStore): RawPreserver {
  return {
    async preserve(file) {
      store.preserved.add(file.id);
    },
  };
}

export interface MemoryPipelineDeps extends PipelineDeps {
  store: MemoryStore;
}

export function createMemoryPipelineDeps(
  store: MemoryStore = createMemoryStore(),
  options: {
    accountCodes?: string[];
    approvedBatches?: string[];
    postedContent?: Array<{
      companyId: string;
      fiscalYearId: string;
      kind: string;
      contentHash: string;
      id: string;
    }>;
  } = {},
): MemoryPipelineDeps {
  for (const b of options.approvedBatches ?? []) store.approvals.add(b);
  for (const c of options.postedContent ?? []) {
    store.postedContent.set(
      `${c.companyId}|${c.fiscalYearId}|${c.kind}|${c.contentHash}`,
      c.id,
    );
  }
  return {
    store,
    sourceFiles: createMemorySourceFiles(store),
    batches: createMemoryBatches(store),
    staging: createMemoryStaging(store),
    issues: createMemoryIssues(store),
    catalog: createMemoryCatalog(options.accountCodes ?? ["1000", "4000"]),
    contentProbe: createMemoryContentProbe(store),
    approvalProbe: createMemoryApprovals(store),
    posting: createMemoryPosting(store),
    preserver: createMemoryPreserver(store),
    nowIso: () => new Date(0).toISOString(), // deterministic for tests
  };
}
