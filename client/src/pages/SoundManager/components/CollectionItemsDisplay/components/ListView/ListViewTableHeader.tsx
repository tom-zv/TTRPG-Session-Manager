export const ListViewTableHeader: React.FC<{
  columns: string[];
  showHeaders: boolean;
  showActions: boolean;
}> = ({ columns, showHeaders, showActions }) => {
  if (!showHeaders) return null;
  return (
    <thead>
      <tr>
        {columns.map(column => {
          if (column === "position") return <th key={column}>#</th>;
          if (column === "actions" && !showActions) return null;
          if (column === "actions")
            return (
              <th key={column} className="actions-column">
                Actions
              </th>
            );
          return (
            <th key={column}>
              {column.charAt(0).toUpperCase() + column.slice(1)}
            </th>
          );
        })}
      </tr>
    </thead>
  );
};