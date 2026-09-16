// Types for the suggestions (/suggestions) feature module.

export type SuggestionCategory = "News" | "Study Tip" | "Fact";

export type Suggestion = {
  category: SuggestionCategory | string;
  title: string;
  description: string;
  relatedTopic: string;
};
