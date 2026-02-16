import { Fragment, type ReactNode } from "react";

const BLOCK_START_PATTERN = /^(#{1,6}\s+|[-*]\s+|\d+\.\s+|---+$)/;
const INLINE_TOKEN_PATTERN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((?:https?:\/\/|mailto:|\/)[^)]+\)|https?:\/\/[^\s]+)/g;

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  INLINE_TOKEN_PATTERN.lastIndex = 0;
  while ((match = INLINE_TOKEN_PATTERN.exec(text)) !== null) {
    const index = match.index;
    if (index > cursor) {
      nodes.push(text.slice(cursor, index));
    }

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(
        <strong key={`${keyPrefix}-strong-${index}`}>
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code
          key={`${keyPrefix}-code-${index}`}
          className="rounded bg-slate-100 px-1 py-0.5 text-[0.92em]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith("[")) {
      const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        nodes.push(
          <a
            key={`${keyPrefix}-link-${index}`}
            href={href}
            target={href.startsWith("http") ? "_blank" : undefined}
            rel={href.startsWith("http") ? "noreferrer noopener" : undefined}
          >
            {label}
          </a>,
        );
      } else {
        nodes.push(token);
      }
    } else {
      nodes.push(
        <a key={`${keyPrefix}-url-${index}`} href={token} target="_blank" rel="noreferrer noopener">
          {token}
        </a>,
      );
    }

    cursor = INLINE_TOKEN_PATTERN.lastIndex;
  }

  if (cursor < text.length) {
    nodes.push(text.slice(cursor));
  }

  return nodes.length > 0 ? nodes : [text];
}

export function renderMarkdown(markdown: string): ReactNode[] {
  const lines = markdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const nodes: ReactNode[] = [];

  let lineIndex = 0;
  while (lineIndex < lines.length) {
    const rawLine = lines[lineIndex];
    const trimmedLine = rawLine.trim();

    if (!trimmedLine) {
      lineIndex += 1;
      continue;
    }

    if (/^---+$/.test(trimmedLine)) {
      nodes.push(<hr key={`hr-${lineIndex}`} />);
      lineIndex += 1;
      continue;
    }

    const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const HeadingTag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      nodes.push(
        <HeadingTag key={`heading-${lineIndex}`}>
          {renderInline(headingMatch[2], `heading-${lineIndex}`)}
        </HeadingTag>,
      );
      lineIndex += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmedLine)) {
      const items: string[] = [];
      while (lineIndex < lines.length) {
        const listLine = lines[lineIndex].trim();
        const matchList = listLine.match(/^[-*]\s+(.+)$/);
        if (!matchList) {
          break;
        }
        items.push(matchList[1]);
        lineIndex += 1;
      }

      nodes.push(
        <ul key={`ul-${lineIndex}`}>
          {items.map((item, index) => (
            <li key={`ul-${lineIndex}-item-${index}`}>{renderInline(item, `ul-${lineIndex}-${index}`)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s+/.test(trimmedLine)) {
      const items: string[] = [];
      while (lineIndex < lines.length) {
        const listLine = lines[lineIndex].trim();
        const matchList = listLine.match(/^\d+\.\s+(.+)$/);
        if (!matchList) {
          break;
        }
        items.push(matchList[1]);
        lineIndex += 1;
      }

      nodes.push(
        <ol key={`ol-${lineIndex}`}>
          {items.map((item, index) => (
            <li key={`ol-${lineIndex}-item-${index}`}>{renderInline(item, `ol-${lineIndex}-${index}`)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    const paragraphLines: string[] = [];
    while (lineIndex < lines.length) {
      const paragraphLine = lines[lineIndex];
      const trimmedParagraphLine = paragraphLine.trim();
      if (!trimmedParagraphLine || BLOCK_START_PATTERN.test(trimmedParagraphLine)) {
        break;
      }
      paragraphLines.push(trimmedParagraphLine);
      lineIndex += 1;
    }

    nodes.push(
      <p key={`p-${lineIndex}`}>
        {paragraphLines.map((line, index) => (
          <Fragment key={`p-${lineIndex}-line-${index}`}>
            {index > 0 ? <br /> : null}
            {renderInline(line, `p-${lineIndex}-${index}`)}
          </Fragment>
        ))}
      </p>,
    );
  }

  return nodes;
}
