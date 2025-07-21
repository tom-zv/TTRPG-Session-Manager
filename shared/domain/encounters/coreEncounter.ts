export type CoreEncounter = {
  id: number;
  name: string;
  description: string;
  status: "planned" | "active" | "completed";
  location: string;
  difficulty: string;
  roundCount: number;
  dmNotes: { text: string; timestamp: string };
  createdAt: string;
};
