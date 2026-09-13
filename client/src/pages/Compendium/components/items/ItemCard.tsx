import React from "react";
import type { Item, ItemLink, ItemMemberRelation } from "shared/domain/dnd5e/item.js";
import { useItemMembers } from "../../api/query/useItemQueries.js";
import type { ItemViewer } from "../../api/query/itemKeys.js";
import { RichText } from "../RichText/RichText.js";
import { SpellLink, renderSpellLink } from "../spells/SpellLink.js";
import { useItemLinks } from "./ItemLink.js";
import {
  capitalize,
  formatAttunement,
  formatItemLink,
  formatItemType,
  formatItemValue,
  formatItemWeight,
} from "./itemFormat.js";
import { useItemEdit } from "./editor/ItemEditContext.js";
import {
  ItemAliasesField,
  ItemBaseRow,
  ItemDescriptionField,
  ItemNameField,
  ItemSourceField,
  ItemSpellsField,
  ItemStatsField,
  ItemSubtitleField,
} from "./editor/ItemSheetFields.js";
import browserStyles from "../browser/Browser.module.css";
import styles from "./Items.module.css";

type ItemCardProps = {
  item: Item;
  viewer: ItemViewer;
  /** Follow a family, base or member link to that item's page. */
  onSelect: (id: number) => void;
  /** Small control in the header's corner, e.g. the GM's actions menu. */
  headerAction?: React.ReactNode;
  /** Shown under the header, e.g. a failed visibility change. */
  notice?: React.ReactNode;
  /** Edit mode: puts the title in the editor's toolbar row. */
  renderEditHeading?: (title: React.ReactNode) => React.ReactNode;
};

const RELATION_TITLES: Record<ItemMemberRelation, string> = {
  specific: "Specific items",
  group_member: "Items in this group",
  pack_content: "Contents",
};

const recharges: Record<string, string> = { dawn: "at dawn", dusk: "at dusk", midnight: "at midnight", restLong: "after a long rest", restShort: "after a short rest" };

type StatLine = { key: string; label: string; text: string };

/** The stats that apply, as the sheet reads them. Keys are the editor's stat keys (`model/fields.ts`). */
const statLines = (item: Item): StatLine[] => {
  const { details } = item;
  const lines: StatLine[] = [];
  const add = (key: string, label: string, text: string) => lines.push({ key, label, text });
  if (item.valueCp !== undefined) add("valueCp", "Value", formatItemValue(item.valueCp));
  if (item.weightLb !== undefined) add("weightLb", "Weight", formatItemWeight(item.weightLb));
  if (details.damage) {
    add("damage", "Damage", [
      details.damage.dice,
      details.damage.type,
      details.damage.versatileDice && `(versatile ${details.damage.versatileDice})`,
    ].filter(Boolean).join(" "));
  }
  if (details.weaponCategory) add("weaponCategory", "Weapon", `${capitalize(details.weaponCategory)} weapon`);
  if (details.range) add("range", "Range", `${details.range} ft.`);
  if (details.armorClass !== undefined) add("armorClass", "Armor Class", String(details.armorClass));
  if (details.strength !== undefined) add("strength", "Strength", `Str ${details.strength}`);
  if (details.stealthDisadvantage) add("stealth", "Stealth", "Disadvantage");
  if (details.bonusWeapon) add("bonusWeapon", "Attack and damage", details.bonusWeapon);
  if (details.bonusAc) add("bonusAc", "AC bonus", details.bonusAc);
  if (details.charges !== undefined) add("charges", "Charges", String(details.charges));
  if (details.recharge) {
    add("recharge", "Recharge", [details.rechargeAmount, recharges[details.recharge] ?? details.recharge].filter(Boolean).join(" "));
  }
  if (details.properties?.length) add("properties", "Properties", details.properties.join(", "));
  if (details.mastery?.length) add("mastery", "Mastery", details.mastery.join(", "));
  return lines;
};

/**
 * An item's page: identity and source first, then the rules data that applies, then related items.
 *
 * Inside an `ItemEditor` the same page is the edit surface, rendered from the draft: in the `live`
 * presentation its values are inputs, in `targets` each opens its editor (`editor/ItemSheetFields`).
 */
export const ItemCard: React.FC<ItemCardProps> = ({ item, viewer, onSelect, headerAction, notice, renderEditHeading }) => {
  const { details } = item;
  const edit = useItemEdit();
  const editing = edit !== null;
  const headingId = `item-heading-${item.id}`;
  const attunement = formatAttunement(item);
  const renderItem = useItemLinks([details.description]);
  const linkButton = (link: ItemLink) => (
    <button type="button" className={styles.itemLink} onClick={() => onSelect(link.id)}>{formatItemLink(link)}</button>
  );

  const stats = statLines(item);
  const subtitle = [
    formatItemType(item),
    details.wondrous && item.category !== "wondrous item" ? ", wondrous" : "",
    attunement ? ` (${attunement.charAt(0).toLowerCase()}${attunement.slice(1)})` : "",
  ].join("");
  const source = `${item.source}${item.page !== undefined ? `, page ${item.page}` : ""}`;
  // A block while editing: a narrow editor expands inside the line, which a paragraph cannot hold.
  const SourceLine = editing ? "div" : "p";
  const title = (
    <h2 id={headingId} className={styles.name}>{editing ? <ItemNameField name={item.name} /> : item.name}</h2>
  );

  return (
    <article className={styles.itemCard} aria-labelledby={headingId}>
      {renderEditHeading?.(title)}
      <header className={styles.header}>
        {headerAction && <div className={styles.headerAction}>{headerAction}</div>}
        {!renderEditHeading && title}
        {editing ? <div className={styles.subtitle}><ItemSubtitleField text={subtitle} /></div> : <p className={styles.subtitle}>{subtitle}</p>}
        <SourceLine className={styles.source}>
          {editing ? <ItemSourceField text={source} /> : source}
          {item.origin === "homebrew" && item.source.toLowerCase() !== "homebrew" && " · homebrew"}
          {item.gm?.locallyEdited && item.origin === "imported" && " · edited"}
        </SourceLine>
        {item.gm && (item.gm.hidden || item.gm.hiddenByFamily) && (
          <p className={styles.visibility} role="status">
            {item.gm.hidden ? "Hidden from players." : "Hidden from players with its family."}
          </p>
        )}
        {editing ? <ItemAliasesField /> : item.aliases.length > 0 && <p className={styles.aliases}>Also called {item.aliases.join(", ")}</p>}
      </header>
      {notice}
      {/* Settled for this editor: a family's page is its own; its specifics keep their own text. */}
      {editing && item.kind === "family" && (
        <p className={styles.notice} role="note">
          Editing a magic variant changes its own page only. Specific items made from it keep their current text.
        </p>
      )}

      {editing ? (
        (item.family || item.kind === "concrete" || item.base) && (
          <dl className={styles.relations}>
            {item.family && (
              <div>
                <dt>Variant of</dt>
                <dd>{formatItemLink(item.family)}</dd>
              </div>
            )}
            <ItemBaseRow />
          </dl>
        )
      ) : (item.family || item.base) && (
        <dl className={styles.relations}>
          {item.family && (
            <div>
              <dt>Variant of</dt>
              <dd>{linkButton(item.family)}</dd>
            </div>
          )}
          {item.base && (
            <div>
              <dt>Base item</dt>
              <dd>{linkButton(item.base)}</dd>
            </div>
          )}
        </dl>
      )}

      {editing ? <ItemStatsField lines={stats} /> : stats.length > 0 && (
        <dl className={styles.stats}>
          {stats.map(({ key, label, text }) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
      )}

      {editing ? <ItemDescriptionField /> : details.description && (
        <RichText text={details.description} renderSpell={renderSpellLink} renderItem={renderItem} className={styles.description} />
      )}

      {editing ? <ItemSpellsField /> : details.spells && details.spells.length > 0 && (
        <section className={styles.section} aria-label="Spells">
          <h3>Spells</h3>
          <p>
            {details.spells.map((spell, index) => (
              <React.Fragment key={`${spell.name}|${spell.source ?? ""}`}>
                {index > 0 && ", "}
                <SpellLink name={spell.name} source={spell.source}>
                  {spell.source ? `${spell.name} (${spell.source})` : spell.name}
                </SpellLink>
              </React.Fragment>
            ))}
          </p>
        </section>
      )}

      {/* A new item has no members yet. */}
      {item.id > 0 && <ItemMembers item={item} viewer={viewer} onSelect={onSelect} />}
    </article>
  );
};

const ItemMembers: React.FC<{ item: Item; viewer: ItemViewer; onSelect: (id: number) => void }> = ({ item, viewer, onSelect }) => {
  const { data, error, isLoading, hasNextPage, fetchNextPage, isFetchingNextPage } = useItemMembers(viewer, item.id);
  const first = data?.pages[0];

  if (isLoading) {
    return item.kind === "concrete" ? null : <p className={browserStyles.hint}>Loading related items…</p>;
  }
  if (error) return <p className={browserStyles.statusError} role="alert">{error.message}</p>;
  if (!first?.relation) return null;
  const title = RELATION_TITLES[first.relation];
  const members = (data?.pages ?? []).flatMap(page => page?.members ?? []);

  return (
    <section className={styles.section} aria-label={title}>
      <h3>{title} <span className={styles.count}>({first.total})</span></h3>
      {members.length === 0 ? (
        <p className={browserStyles.hint}>None visible.</p>
      ) : (
        <ul className={styles.members}>
          {members.map(member => (
            <li key={member.item.id}>
              <button type="button" className={styles.itemLink} onClick={() => onSelect(member.item.id)}>
                {member.quantity !== undefined && member.quantity !== 1 && `${member.quantity} × `}
                {member.item.name}
              </button>
              <span className={styles.memberMeta}>
                {member.item.base && first.relation === "specific" ? formatItemLink(member.item.base) : member.item.source}
              </span>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && (
        <button type="button" className={browserStyles.secondaryButton} disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
          {isFetchingNextPage ? "Loading…" : "Show more"}
        </button>
      )}
    </section>
  );
};
