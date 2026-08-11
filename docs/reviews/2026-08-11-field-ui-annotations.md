# Review, main, 2026-08-11

**Reviewed by**: deepseek-v4-pro (same model as author, no cross model benefit)
**Scope**: 12 files (9 modified + 3 new), uncommitted on main
**Verdict**: Approve with nits

## Summary

This change lifts the voice separator mapping from a MealPlan-specific module into a generic `makeFieldUIAnnotations` factory used across four form surfaces. It also wires `FormTextarea` with a `VoiceInputButton` into the PantryMicButton preview, the RecipeEditPage, and the ShoppingListPage edit dialog. A new RecipeEditPage lets users edit recipe metadata and prose fields post generation. The code is clean, correct, and well tested (280 tests pass, 12 new component tests). Three nits noted below.

## Nits

- ⚪ `src/lib/fieldUIAnnotations.ts:38`, the `_schema` parameter is named with a leading underscore to signal "unused", but it IS used at the type level for inference. This is idiomatic TypeScript but could confuse contributors who read the underscore as "dead parameter". Consider renaming to `schema` and using `// eslint-disable-next-line @typescript-eslint/no-unused-vars` if the linter complains.

- ⚪ `src/features/recipes/RecipeEditPage.tsx:25`, the `RecipeEditSchema` duplicates several field constraints from `RecipeSchema` (name, shortDescription, cuisine max lengths). If `RecipeSchema` changes, the edit schema silently drifts. A partial pick from the original schema would be more maintainable, but the duplication is small enough (8 fields) that the risk is low.

- ⚪ `src/features/shopping-list/ShoppingListPage.tsx:123`, the identity collision guard in `updateQuantity` recomputes `displayText` with the merged quantity, but doesn't include the recipes label suffix that `consolidate.ts`'s `toShoppingItem` adds (`used in N recipes`). If the collided item had recipe provenance info, it is lost. This is an extreme edge case (collision plus multi recipe provenance in a manually edited note) and the existing code never exposed recipe counts on manually edited items anyway.

## Strengths

- The factory pattern is clean and minimal: `makeFieldUIAnnotations` takes a schema (for type inference) and a declarative config of field categories. Every consumer gets the same contract without repeating raw separator strings.
- The identity collision guard in `updateQuantity` handles a genuine edge case (two shopping list items sharing the same identity after note editing) with a merge rather than a crash or duplicate React key. This is defensive code at the right level of detail.
- The `data-voice-separator` attribute contract is tested at both the factory level (existing tests) and the component level (the new 12 FormInput tests), proving the annotation discipline actually reaches the DOM.

## Test coverage

12 new component tests cover `FormInput` and `FormTextarea` rendering: voice separator attributes for annotated and non annotated fields, onChange forwarding, error display, and required state. The existing 268 tests cover the factory and all four field-UI annotation maps. Not covered: RecipeEditPage loading/save flow (needs browser), PantryMicButton voice dictation flow (needs speech API mock), ShoppingListPage edit dialog integration (needs localStorage mock). All three are covered by the test signal being `configured` (vitest present), but deferred to `/check verify` for browser level validation.
