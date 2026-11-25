/** Persian-first navigation map for the Farzam ERP workspace. */

export interface NavItem {
  href: string;
  label: string;
  icon: "dashboard" | "documents" | "imports" | "review" | "validation" | "ledger" | "treasury" | "commerce" | "assets" | "people" | "tax";
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Future modules are visible but intentionally unavailable until implemented. */
  disabled?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "نمای کلی",
    items: [
      { href: "/", label: "داشبورد مالی", icon: "dashboard" },
    ],
  },
  {
    title: "اسناد و داده‌ها",
    items: [
      { href: "/documents", label: "دفتر اسناد", icon: "documents" },
      { href: "/imports", label: "ورود اطلاعات", icon: "imports" },
      { href: "/imports/review", label: "بازبینی و تطبیق", icon: "review" },
      { href: "/validation", label: "کیفیت داده و استثناها", icon: "validation" },
    ],
  },
  {
    title: "ماژول‌های مالی",
    disabled: true,
    items: [
      { href: "#ledger", label: "حسابداری و دفتر کل", icon: "ledger" },
      { href: "#treasury", label: "خزانه و بانک", icon: "treasury" },
      { href: "#commerce", label: "فروش و خرید", icon: "commerce" },
      { href: "#assets", label: "انبار و دارایی‌ها", icon: "assets" },
      { href: "#people", label: "حقوق و دستمزد", icon: "people" },
      { href: "#tax", label: "مالیات و گزارش‌ها", icon: "tax" },
    ],
  },
];
