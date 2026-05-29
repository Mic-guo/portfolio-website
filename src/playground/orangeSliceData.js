export const DISCOVERY_PROMPT = "get me startups that raised more than $10M";

export const STEPS = [
  { key: "industry", prompt: "find the company industry" },
  { key: "ceo", prompt: "find the CEO linkedin" },
  { key: "jobs", prompt: "scrape all the jobs" },
];

export const COLUMNS = [
  { key: "company", label: "Company", width: 180, initial: true },
  { key: "website", label: "Website", width: 220, initial: true },
  { key: "industry", label: "Industry", width: 160, initial: false },
  { key: "ceo", label: "CEO LinkedIn", width: 220, initial: false },
  { key: "jobs", label: "Open Roles", width: 150, initial: false },
];

/** Industry pill colors from orangeslice.ai */
export const INDUSTRY_STYLES = {
  MarTech: { bg: "rgb(240, 222, 210)", color: "rgb(101, 68, 40)" },
  FinTech: { bg: "rgb(213, 227, 246)", color: "rgb(47, 73, 111)" },
  "Developer Tools": { bg: "rgb(240, 222, 210)", color: "rgb(101, 68, 40)" },
  HealthTech: { bg: "rgb(231, 221, 241)", color: "rgb(81, 60, 102)" },
  "B2B SaaS": { bg: "rgb(231, 221, 241)", color: "rgb(81, 60, 102)" },
  "Data & Analytics": { bg: "rgb(223, 213, 207)", color: "rgb(85, 69, 57)" },
  Consumer: { bg: "rgb(244, 221, 218)", color: "rgb(102, 56, 51)" },
  CleanTech: { bg: "rgb(242, 221, 228)", color: "rgb(97, 56, 77)" },
  "Logistics & Supply Chain": { bg: "rgb(223, 213, 207)", color: "rgb(85, 69, 57)" },
};

export const ROWS = [
  {
    company: "clay",
    logo: "/orangeslice-logos/clay.png",
    website: "http://clay.run/",
    industry: "MarTech",
    ceo: "https://www.linkedin.com/in/kareemamin",
    ceoAvatar: "/orangeslice-avatars/kareemamin.jpg",
    jobs: "✅ found 62 jobs",
  },
  {
    company: "ramp",
    logo: "/orangeslice-logos/ramp.png",
    website: "http://ramp.com",
    industry: "FinTech",
    ceo: "https://www.linkedin.com/in/eglyman",
    ceoAvatar: "/orangeslice-avatars/eglyman.jpg",
    jobs: "✅ found 129 jobs",
  },
  {
    company: "Cursor",
    logo: "/orangeslice-logos/cursor.png",
    website: "https://cursor.com/",
    industry: "Developer Tools",
    ceo: "https://www.linkedin.com/in/michael-t-5b1bbb122",
    ceoAvatar: "/orangeslice-avatars/michael-t-5b1bbb122.jpg",
    jobs: "✅ found 71 jobs",
  },
  {
    company: "plaid",
    logo: "/orangeslice-logos/plaid.png",
    website: "https://www.plaid.com/",
    industry: "FinTech",
    ceo: "https://www.linkedin.com/in/zperret",
    ceoAvatar: "/orangeslice-avatars/zperret.svg",
    jobs: "✅ found 97 jobs",
  },
  {
    company: "ro",
    logo: "/orangeslice-logos/ro.png",
    website: "https://ro.co/",
    industry: "HealthTech",
    ceo: "https://www.linkedin.com/in/zachreitano",
    ceoAvatar: "/orangeslice-avatars/zachreitano.svg",
    jobs: "✅ found 69 jobs",
  },
  {
    company: "airtable",
    logo: "/orangeslice-logos/airtable.png",
    website: "http://airtable.com/",
    industry: "B2B SaaS",
    ceo: "https://www.linkedin.com/in/howieliu",
    ceoAvatar: "/orangeslice-avatars/howieliu.jpg",
    jobs: "✅ found 47 jobs",
  },
  {
    company: "amplitude",
    logo: "/orangeslice-logos/amplitude.png",
    website: "https://amplitude.com/",
    industry: "Data & Analytics",
    ceo: "https://www.linkedin.com/in/spenserskates",
    ceoAvatar: "/orangeslice-avatars/spenserskates.jpg",
    jobs: "✅ found 41 jobs",
  },
  {
    company: "Scopely",
    logo: "/orangeslice-logos/scopely.png",
    website: "http://scopely.com/",
    industry: "Consumer",
    ceo: "https://www.linkedin.com/in/walterdriver",
    ceoAvatar: "/orangeslice-avatars/walterdriver.svg",
    jobs: "✅ found 170 jobs",
  },
  {
    company: "stripe",
    logo: "/orangeslice-logos/stripe.png",
    website: "http://stripe.com/",
    industry: "FinTech",
    ceo: "https://www.linkedin.com/in/patrickcollison",
    ceoAvatar: "/orangeslice-avatars/patrickcollison.svg",
    jobs: "✅ found 18 jobs",
  },
  {
    company: "Zipline",
    logo: "/orangeslice-logos/zipline.png",
    website: "http://www.flyzipline.com/",
    industry: "Logistics & Supply Chain",
    ceo: "https://www.linkedin.com/in/kellerrinaudo",
    ceoAvatar: "/orangeslice-avatars/kellerrinaudo.svg",
    jobs: "✅ found 102 jobs",
  },
];
