import type { DashboardVisuals as DashboardVisualData } from "@/modules/analytics/dashboard";
import { toFaDigits } from "@/lib/display";

interface Props {
  data: DashboardVisualData;
  documentsLoaded: number;
  documentsTotal: number;
  batchesLoaded: number;
  batchesTotal: number;
}

const DONUT_COLORS = [
  "#4472F6", "#3C2C7B", "#FF7A59", "#159A72",
  "#D99A32", "#3296A8", "#8293A8",
];

const STATUS_COLORS: Record<string, string> = {
  created: "#8293A8",
  running: "#4472F6",
  ready_to_post: "#159A72",
  posting: "#3C2C7B",
  posted: "#16845F",
  failed: "#C34848",
  cancelled: "#A1AAB7",
};

export function DashboardVisuals({
  data,
  documentsLoaded,
  documentsTotal,
  batchesLoaded,
  batchesTotal,
}: Props) {
  const hasPartialDocuments = documentsTotal > documentsLoaded;
  const hasPartialBatches = batchesTotal > batchesLoaded;

  return (
    <section className="fz-analytics-section" aria-labelledby="analytics-title">
      <header className="fz-analytics-heading">
        <div className="fz-analytics-heading-copy">
          <span className="fz-analytics-eyebrow">FINANCIAL WORKSPACE · FY OVERVIEW</span>
          <h2 id="analytics-title">نمای تحلیلی فعالیت‌های مالی</h2>
          <p>تصویر روشن‌تری از روند ثبت اسناد، ترکیب مدارک و وضعیت پردازش اطلاعات</p>
        </div>
        <span className="fz-analytics-period">فقط سال مالی انتخاب‌شده</span>
      </header>

      <div className="fz-analytics-grid">
        <section className="fz-chart-card fz-chart-card-monthly" aria-labelledby="monthly-chart-title">
          <header className="fz-chart-card-head">
            <div>
              <h3 id="monthly-chart-title">روند ماهانه ثبت اسناد</h3>
              <p>تعداد اسناد بر اساس تاریخ شمسی ثبت‌شده</p>
            </div>
            <span className="fz-chart-stat">
              <strong>{toFaDigits(String(documentsLoaded))}</strong>
              <span>سند بررسی‌شده</span>
            </span>
          </header>
          {data.datedDocuments === 0 ? (
            <ChartEmpty title="داده تاریخ‌دار کافی نیست" description="پس از ثبت تاریخ اسناد، روند ماهانه اینجا نمایش داده می‌شود." />
          ) : (
            <div className="fz-chart-svg-scroll">
              <MonthlyBars data={data.monthlyDocuments} />
            </div>
          )}
          <footer className="fz-chart-footnote">
            {hasPartialDocuments
              ? "نمودار بر پایه " + toFaDigits(String(documentsLoaded)) + " سند اخیر از " + toFaDigits(String(documentsTotal)) + " سند ساخته شده است."
              : "مبنای نمودار: تمام اسناد دریافت‌شده در سال مالی انتخاب‌شده."}
          </footer>
        </section>

        <section className="fz-chart-card fz-chart-card-types" aria-labelledby="types-chart-title">
          <header className="fz-chart-card-head">
            <div>
              <h3 id="types-chart-title">ترکیب انواع اسناد</h3>
              <p>سهم هر نوع سند از مدارک دریافت‌شده</p>
            </div>
          </header>
          {data.documentTypes.length === 0 ? (
            <ChartEmpty title="هنوز سندی ثبت نشده" description="با ورود اطلاعات، ترکیب اسناد به‌صورت خودکار ساخته می‌شود." />
          ) : (
            <DocumentTypeDonut data={data.documentTypes} />
          )}
          <footer className="fz-chart-footnote">
            {hasPartialDocuments
              ? "بر اساس " + toFaDigits(String(documentsLoaded)) + " سند اخیر؛ از کل " + toFaDigits(String(documentsTotal)) + " سند."
              : "بر اساس تمام اسناد ثبت‌شده در این سال مالی."}
          </footer>
        </section>

        <section className="fz-chart-card fz-chart-card-pipeline" aria-labelledby="pipeline-chart-title">
          <header className="fz-chart-card-head">
            <div>
              <h3 id="pipeline-chart-title">سلامت فرایند ورود اطلاعات</h3>
              <p>توزیع دسته‌های ورود بر اساس وضعیت واقعی پردازش</p>
            </div>
            <span className="fz-chart-stat">
              <strong>{toFaDigits(String(batchesLoaded))}</strong>
              <span>دسته بررسی‌شده</span>
            </span>
          </header>
          {data.batchStatuses.length === 0 ? (
            <ChartEmpty title="فرایند ورودی وجود ندارد" description="با ایجاد اولین دسته ورود اطلاعات، وضعیت آن در این نمودار دیده می‌شود." />
          ) : (
            <div className="fz-pipeline-list">
              {data.batchStatuses.map((item) => {
                const percent = batchesLoaded > 0 ? (item.value / batchesLoaded) * 100 : 0;
                return (
                  <div className="fz-pipeline-row" key={item.status}>
                    <div className="fz-pipeline-label">
                      <span className="fz-pipeline-dot" style={{ backgroundColor: STATUS_COLORS[item.status] ?? "#8293A8" }} />
                      <span>{item.label}</span>
                    </div>
                    <div
                      className="fz-pipeline-track"
                      role="progressbar"
                      aria-label={item.label}
                      aria-valuemin={0}
                      aria-valuemax={batchesLoaded}
                      aria-valuenow={item.value}
                    >
                      <span
                        className="fz-pipeline-fill"
                        style={{
                          width: percent + "%",
                          backgroundColor: STATUS_COLORS[item.status] ?? "#8293A8",
                        }}
                      />
                    </div>
                    <strong className="fz-pipeline-value">{toFaDigits(String(item.value))}</strong>
                  </div>
                );
              })}
            </div>
          )}
          <footer className="fz-chart-footnote">
            {hasPartialBatches
              ? "نمایش " + toFaDigits(String(batchesLoaded)) + " دسته اخیر از " + toFaDigits(String(batchesTotal)) + " دسته."
              : "بر اساس تمام دسته‌های ورود اطلاعات ثبت‌شده در این سال مالی."}
          </footer>
        </section>
      </div>

      <p className="fz-analytics-disclaimer">
        این نمودارها شاخص‌های عملیاتی اسناد و ورود اطلاعات هستند؛ جایگزین صورت سود و زیان، ترازنامه یا مانده واقعی حساب‌ها نیستند.
      </p>
    </section>
  );
}

function MonthlyBars({ data }: { data: Array<{ month: string; value: number }> }) {
  const maxValue = Math.max(1, ...data.map((item) => item.value));
  const plotTop = 28;
  const plotBottom = 168;
  const plotHeight = plotBottom - plotTop;
  const gridLines = [0, 1, 2, 3];

  return (
    <svg className="fz-monthly-chart" viewBox="0 0 740 218" role="img" aria-label="نمودار میله‌ای تعداد اسناد ثبت‌شده در ماه‌های سال مالی">
      <defs>
        <linearGradient id="fz-monthly-gradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6E91FF" />
          <stop offset="100%" stopColor="#4472F6" />
        </linearGradient>
      </defs>
      {gridLines.map((line) => {
        const y = plotTop + (plotHeight / 3) * line;
        return <line key={line} x1="22" x2="718" y1={y} y2={y} stroke="#E9EEF5" strokeDasharray="3 5" />;
      })}
      {data.map((item, index) => {
        const x = 34 + index * 57;
        const barHeight = item.value === 0 ? 0 : Math.max(6, (item.value / maxValue) * plotHeight);
        const y = plotBottom - barHeight;
        return (
          <g key={item.month}>
            <rect
              x={x}
              y={y}
              width="29"
              height={barHeight}
              rx="7"
              fill="url(#fz-monthly-gradient)"
              opacity={item.value === 0 ? 0.16 : 1}
            >
              <title>{item.month + ": " + item.value + " سند"}</title>
            </rect>
            {item.value > 0 ? (
              <text x={x + 14.5} y={Math.max(17, y - 8)} textAnchor="middle" className="fz-chart-bar-value">
                {toFaDigits(String(item.value))}
              </text>
            ) : null}
            <text x={x + 14.5} y="194" textAnchor="middle" className="fz-chart-axis-label">
              {item.month}
            </text>
          </g>
        );
      })}
      <line x1="22" x2="718" y1={plotBottom} y2={plotBottom} stroke="#DCE4EF" />
    </svg>
  );
}

function DocumentTypeDonut({ data }: { data: Array<{ type: string; label: string; value: number }> }) {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

  return (
    <div className="fz-donut-layout">
      <svg className="fz-donut-chart" viewBox="0 0 220 220" role="img" aria-label="نمودار حلقه‌ای ترکیب انواع اسناد">
        <circle cx="110" cy="110" r="76" fill="none" stroke="#EEF2F7" strokeWidth="23" />
        <g transform="rotate(-90 110 110)">
          {data.map((item, index) => {
            const share = (item.value / total) * 100;
            const currentOffset = offset;
            offset += share;
            return (
              <circle
                key={item.type}
                cx="110"
                cy="110"
                r="76"
                fill="none"
                stroke={DONUT_COLORS[index % DONUT_COLORS.length]}
                strokeWidth="23"
                strokeDasharray={String(share) + " " + String(100 - share)}
                strokeDashoffset={-currentOffset}
                strokeLinecap="butt"
                pathLength="100"
              >
                <title>{item.label + ": " + item.value}</title>
              </circle>
            );
          })}
        </g>
        <text x="110" y="105" textAnchor="middle" className="fz-donut-total">{toFaDigits(String(total))}</text>
        <text x="110" y="128" textAnchor="middle" className="fz-donut-caption">سند</text>
      </svg>
      <ul className="fz-donut-legend">
        {data.map((item, index) => {
          const share = total > 0 ? Math.round((item.value / total) * 100) : 0;
          return (
            <li key={item.type}>
              <span className="fz-donut-legend-dot" style={{ backgroundColor: DONUT_COLORS[index % DONUT_COLORS.length] }} />
              <span className="fz-donut-legend-label">{item.label}</span>
              <strong>{toFaDigits(String(item.value))}</strong>
              <small>{toFaDigits(String(share))}٪</small>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ChartEmpty({ title, description }: { title: string; description: string }) {
  return (
    <div className="fz-chart-empty">
      <span className="fz-chart-empty-mark" aria-hidden="true">⌁</span>
      <strong>{title}</strong>
      <span>{description}</span>
    </div>
  );
}
