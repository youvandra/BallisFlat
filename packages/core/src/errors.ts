// Every failure the user can hit, as one plain sentence. The UI, API and docs read from here.
// Add contract errors by their ABI name; a test pins that each one has a sentence.

export const errorSentences = {
  InsufficientBalance: "Your balance is too low for this amount.",
  NotAuthorized: "This wallet is not allowed to do that.",
  Unknown: "Something went wrong. Nothing was sent.",
} as const satisfies Record<string, string>;

export type ErrorName = keyof typeof errorSentences;

export function sentenceFor(name: string): string {
  return name in errorSentences ? errorSentences[name as ErrorName] : errorSentences.Unknown;
}
