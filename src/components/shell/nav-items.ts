/** Sidebar navigation structure (Persian, grouped). */

export interface NavItem {
  href: string;
  label: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** Future modules are visible but explicitly disabled. */
  disabled?: boolean;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "عملیات",
    items: [
      { href: "/", label: "داشبورد مالی" },
      { href: "/documents", label: "دفتر اسناد" },
    ],
  },
  {
    title: "ورود اطلاعات",
    items: [
      { href: "/imports", label: "مانیتور ورود اطلاعات" },
      { href: "/imports/review", label: "بازبینی ورود اطلاعات" },
      { href: "/validation", label: "اعتبارسنجی و استثناها" },
    ],
  },
  {
    title: "ماژول‌های آینده",
    disabled: true,
    items: [
      { href: "#", label: "حسابداری و دفتر کل" },
      { href: "#", label: "خزانه و بانک" },
      { href: "#", label: "فروش و خرید" },
      { href: "#", label: "دارایی و مالیات" },
    ],
  },
];
