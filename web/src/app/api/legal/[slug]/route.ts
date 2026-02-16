import { readFile } from "node:fs/promises";
import path from "node:path";

export const runtime = "nodejs";

const REPO_ROOT = path.resolve(process.cwd(), "..");
const LEGAL_FILES: Record<string, string> = {
  "terms-of-service": "docs/important/terms_of_service.md",
  "privacy-policy": "docs/important/privacy_policy.md",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const relativeFilePath = LEGAL_FILES[slug];
  if (!relativeFilePath) {
    return new Response("Not found", { status: 404 });
  }

  const absoluteFilePath = path.resolve(REPO_ROOT, relativeFilePath);
  if (!absoluteFilePath.startsWith(`${REPO_ROOT}${path.sep}`)) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const markdown = await readFile(absoluteFilePath, "utf8");
    return new Response(markdown, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
