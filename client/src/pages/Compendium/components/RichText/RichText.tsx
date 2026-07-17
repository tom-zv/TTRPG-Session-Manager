import React from "react";
import {
  parseInlineTags,
  parseRichTextBlocks,
  type InlineToken,
  type RichTextLine,
} from "shared/domain/dnd5e/richText.js";
import styles from "./RichText.module.css";

export type SpellTokenRenderer = (token: Extract<InlineToken, { type: "spell" }>, key: string) => React.ReactNode;

type RichTextProps = {
  text: string;
  /** Inline text only (monster descriptions); otherwise paragraphs, lists and tables. */
  inline?: boolean;
  /** How {@spell} mentions render; plain text by default. */
  renderSpell?: SpellTokenRenderer;
  className?: string;
};

// Renders the text format of shared/domain/dnd5e/richText.ts.
export const RichText: React.FC<RichTextProps> = ({ text, inline = false, renderSpell, className }) => {
  if (inline) {
    return <span className={className}><InlineText text={text} renderSpell={renderSpell} /></span>;
  }

  return (
    <div className={[styles.richText, className].filter(Boolean).join(" ")}>
      {parseRichTextBlocks(text).map((block, index) => {
        const key = `${block.type}-${index}`;
        switch (block.type) {
          case "paragraph":
            return <p key={key}><Line line={block} renderSpell={renderSpell} /></p>;
          case "list":
            return (
              <ul key={key}>
                {block.items.map((item, itemIndex) => (
                  <li key={itemIndex}><Line line={item} renderSpell={renderSpell} /></li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={key} className={styles.tableWrap}>
                <table>
                  {block.caption && <caption><InlineText text={block.caption} renderSpell={renderSpell} /></caption>}
                  <thead>
                    <tr>
                      {block.header.map((cell, cellIndex) => (
                        <th key={cellIndex} scope="col"><InlineText text={cell} renderSpell={renderSpell} /></th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, rowIndex) => (
                      <tr key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <td key={cellIndex}><InlineText text={cell} renderSpell={renderSpell} /></td>
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

const Line: React.FC<{ line: RichTextLine; renderSpell?: SpellTokenRenderer }> = ({ line, renderSpell }) => (
  <>
    {line.lead && <strong className={styles.lead}>{line.lead}</strong>}
    {line.lead && line.text && " "}
    <InlineText text={line.text} renderSpell={renderSpell} />
  </>
);

const InlineText: React.FC<{ text: string; renderSpell?: SpellTokenRenderer }> = ({ text, renderSpell }) => (
  <>
    {parseInlineTags(text).map((token, index) => {
      const key = `${token.type}-${index}`;
      if (token.type === "text") return <React.Fragment key={key}>{token.text}</React.Fragment>;
      return renderSpell ? renderSpell(token, key) : <React.Fragment key={key}>{token.display ?? token.name}</React.Fragment>;
    })}
  </>
);
