"use client";

import { useCallback, useState } from "react";

import { LEGAL_DOCUMENTS, type LegalDocumentKey } from "@/lib/legal/legal-documents";
import { LegalDocumentModal } from "@/components/legal/legal-document-modal";

type ContentCache = Partial<Record<LegalDocumentKey, string>>;

export function useLegalDocumentModal() {
  const [open, setOpen] = useState(false);
  const [activeKey, setActiveKey] = useState<LegalDocumentKey>("terms");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [contentCache, setContentCache] = useState<ContentCache>({});

  const openLegalDocument = useCallback(
    async (key: LegalDocumentKey) => {
      setOpen(true);
      setActiveKey(key);
      setError("");

      if (contentCache[key]) {
        return;
      }

      setLoading(true);
      try {
        const response = await fetch(LEGAL_DOCUMENTS[key].href, { cache: "force-cache" });
        if (!response.ok) {
          throw new Error("文档加载失败，请稍后重试");
        }
        const markdown = await response.text();
        setContentCache((previous) => ({
          ...previous,
          [key]: markdown,
        }));
      } catch (requestError) {
        setError(requestError instanceof Error ? requestError.message : "文档加载失败，请稍后重试");
      } finally {
        setLoading(false);
      }
    },
    [contentCache],
  );

  const closeLegalDocument = useCallback(() => {
    setOpen(false);
  }, []);

  const legalDocumentModal = (
    <LegalDocumentModal
      open={open}
      title={LEGAL_DOCUMENTS[activeKey].title}
      markdown={contentCache[activeKey] ?? ""}
      loading={loading}
      error={error}
      onClose={closeLegalDocument}
    />
  );

  return {
    legalDocs: LEGAL_DOCUMENTS,
    openLegalDocument,
    legalDocumentModal,
  };
}
