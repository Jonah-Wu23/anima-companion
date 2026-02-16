export type LegalDocumentKey = "terms" | "privacy";

export interface LegalDocumentMeta {
  title: string;
  href: string;
}

export const LEGAL_DOCUMENTS: Record<LegalDocumentKey, LegalDocumentMeta> = {
  terms: {
    title: "服务条款",
    href: "/api/legal/terms-of-service",
  },
  privacy: {
    title: "隐私政策",
    href: "/api/legal/privacy-policy",
  },
};
