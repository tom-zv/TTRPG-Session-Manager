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
};

const RELATION_TITLES: Record<ItemMemberRelation, string> = {
  specific: "Specific items",
  group_member: "Items in this group",
  pack_content: "Contents",
};

const recharges: Record<string, string> = { dawn: "at dawn", dusk: "at dusk", midnight: "at midnight", restLong: "after a long rest", restShort: "after a short rest" };

/** An item's page: identity and source first, then the rules data that applies, then related items. */
export const ItemCard: React.FC<ItemCardProps> = ({ item, viewer, onSelect, headerAction, notice }) => {
  const { details } = item;
  const headingId = `item-heading-${item.id}`;
  const attunement = formatAttunement(item);
  const renderItem = useItemLinks([details.description]);
  const linkButton = (link: ItemLink) => (
    <button type="button" className={styles.itemLink} onClick={() => onSelect(link.id)}>{formatItemLink(link)}</button>
  );

  const stats: Array<[string, React.ReactNode]> = [];
  if (item.valueCp !== undefined) stats.push(["Value", formatItemValue(item.valueCp)]);
  if (item.weightLb !== undefined) stats.push(["Weight", formatItemWeight(item.weightLb)]);
  if (details.damage) {
    stats.push(["Damage", [
      details.damage.dice,
      details.damage.type,
      details.damage.versatileDice && `(versatile ${details.damage.versatileDice})`,
    ].filter(Boolean).join(" ")]);
  }
  if (details.weaponCategory) stats.push(["Weapon", `${capitalize(details.weaponCategory)} weapon`]);
  if (details.range) stats.push(["Range", `${details.range} ft.`]);
  if (details.armorClass !== undefined) stats.push(["Armor Class", String(details.armorClass)]);
  if (details.strength !== undefined) stats.push(["Strength", `Str ${details.strength}`]);
  if (details.stealthDisadvantage) stats.push(["Stealth", "Disadvantage"]);
  if (details.bonusWeapon) stats.push(["Attack and damage", details.bonusWeapon]);
  if (details.bonusAc) stats.push(["AC bonus", details.bonusAc]);
  if (details.charges !== undefined) stats.push(["Charges", String(details.charges)]);
  if (details.recharge) {
    stats.push(["Recharge", [details.rechargeAmount, recharges[details.recharge] ?? details.recharge].filter(Boolean).join(" ")]);
  }
  if (details.properties?.length) stats.push(["Properties", details.properties.join(", ")]);
  if (details.mastery?.length) stats.push(["Mastery", details.mastery.join(", ")]);

  return (
    <article className={styles.itemCard} aria-labelledby={headingId}>
      <header className={styles.header}>
        {headerAction && <div className={styles.headerAction}>{headerAction}</div>}
        <h2 id={headingId} className={styles.name}>{item.name}</h2>
        <p className={styles.subtitle}>
          {formatItemType(item)}
          {details.wondrous && item.category !== "wondrous item" && ", wondrous"}
          {attunement && ` (${attunement.charAt(0).toLowerCase()}${attunement.slice(1)})`}
        </p>
        <p className={styles.source}>
          {item.source}
          {item.page !== undefined && `, page ${item.page}`}
          {item.origin === "homebrew" && item.source.toLowerCase() !== "homebrew" && " · homebrew"}
          {item.gm?.locallyEdited && item.origin === "imported" && " · edited"}
        </p>
        {item.gm && (item.gm.hidden || item.gm.hiddenByFamily) && (
          <p className={styles.visibility} role="status">
            {item.gm.hidden ? "Hidden from players." : "Hidden from players with its family."}
          </p>
        )}
        {item.aliases.length > 0 && <p className={styles.aliases}>Also called {item.aliases.join(", ")}</p>}
      </header>
      {notice}

      {(item.family || item.base) && (
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

      {stats.length > 0 && (
        <dl className={styles.stats}>
          {stats.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}

      {details.description && (
        <RichText text={details.description} renderSpell={renderSpellLink} renderItem={renderItem} className={styles.description} />
      )}

      {details.spells && details.spells.length > 0 && (
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

      <ItemMembers item={item} viewer={viewer} onSelect={onSelect} />
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
