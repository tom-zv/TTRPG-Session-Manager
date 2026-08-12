import React from "react";
import {
  parseInlineTags,
  parseRichTextBlocks,
  type InlineToken,
  type RichTextLine,
} from "shared/domain/dnd5e/richText.js";
import styles from "./RichText.module.css";

export type SpellTokenRenderer = (token: Extract<InlineToken, { type: "spell" }>, key: string) => React.ReactNode;
export type ItemTokenRenderer = (token: Extract<InlineToken, { type: "item" }>, key: string) => React.ReactNode;

type Renderers = {
  /** How {@spell} mentions render; plain text by default. */
  renderSpell?: SpellTokenRenderer;
  /** How {@item} mentions render; plain text by default. */
  renderItem?: ItemTokenRenderer;
};

type RichTextProps = Renderers & {
  text: string;
  /** Inline text only (monster descriptions); otherwise paragraphs, lists and tables. */
  inline?: boolean;
  className?: string;
};

// Renders the text format of shared/domain/dnd5e/richText.ts.
export const RichText: React.FC<RichTextProps> = ({ text, inline = false, renderSpell, renderItem, className }) => {
  const renderers = { renderSpell, renderItem };
  if (inline) {
    return <span className={className}><InlineText text={text} {...renderers} /></span>;
  }

  return (
    <div className={[styles.richText, className].filter(Boolean).join(" ")}>
      {parseRichTextBlocks(text).map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case "paragraph":
            return <p key={key}><Line line={block} {...renderers} /></p>;
          case "list":
            return (
              <ul key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}><Line line={item} {...renderers} /></li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={key} className={styles.tableWrap}>
                <table>
                  {block.caption && <caption><InlineText text={block.caption} {...renderers} /></caption>}
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col"><InlineText text={cell} {...renderers} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}><InlineText text={cell} {...renderers} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
};

const Line: React.FC<Renderers & { line: RichTextLine }> = ({ line, ...renderers }) => (
  <>
    {line.lead && <strong className={styles.lead}>{line.lead}</strong>}
    {line.lead && line.text && " "}
    <InlineText text={line.text} {...renderers} />
  </>
);

const InlineText: React.FC<Renderers & { text: string }> = ({ text, renderSpell, renderItem }) => (
  <>
    {parseInlineTags(text).map((token, index) => {
      const key = `${token.type}-${index}`;
      if (token.type === "text") return <React.Fragment key={key}>{token.text}</React.Fragment>;
      if (token.type === "spell" && renderSpell) return renderSpell(token, key);
      if (token.type === "item" && renderItem) return renderItem(token, key);
      return <React.Fragment key={key}>{token.display ?? token.name}</React.Fragment>;
    })}
  </>
);
