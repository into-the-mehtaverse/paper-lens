# Migration Notes for Updated Dependencies

This document tracks the major version updates and any required code changes.

## Major Version Updates

### React 18 → 19
- **Breaking Changes**:
  - New JSX transform (automatic)
  - `useFormStatus` and `useFormState` hooks added
  - `ref` is now a regular prop (no `forwardRef` needed in many cases)
- **Action Required**:
  - Code should work as-is, but test thoroughly
  - Update any deprecated patterns

### Vite 5 → 7
- **Breaking Changes**:
  - Node.js 18+ required
  - Some plugin APIs changed
- **Action Required**:
  - Verify build still works
  - Check CRXJS plugin compatibility

### Tailwind CSS 3.4.1 → 3.4.19 (Latest 3.x)
- **Status**: Updated to latest Tailwind 3.x for stability
- **Note**: Tailwind 4.x (4.1.18) is available but requires significant config migration (CSS-first approach)
- **Future**: Can migrate to Tailwind 4 when ready (requires CSS-first config rewrite)

### Zod 3 → 4
- **Breaking Changes**:
  - Some schema methods changed
  - Error format changes
- **Action Required**:
  - Review schema definitions in `src/schemas/`
  - Test validation still works

### ESLint 8 → 9
- **Breaking Changes**:
  - Flat config format (new default)
  - Some plugin APIs changed
- **Action Required**:
  - Update `.eslintrc.cjs` to flat config format OR use legacy mode
  - Update ESLint plugins

### Dexie 3 → 4
- **Breaking Changes**:
  - Some API changes
  - TypeScript types improved
- **Action Required**:
  - Review `src/store/db.ts`
  - Test IndexedDB operations

### OpenAI SDK 4 → 6
- **Breaking Changes**:
  - API client initialization changed
  - Some method signatures updated
- **Action Required**:
  - Review `src/llm/index.ts` and `src/embed/index.ts`
  - Update OpenAI client usage

### pdfjs-dist 4 → 5
- **Breaking Changes**:
  - Worker loading may have changed
  - Some API changes
- **Action Required**:
  - Review `src/reader/pdf-extractor.ts`
  - Test PDF extraction

## Immediate Fixes Needed

1. **@types/pdfjs-dist**: Fixed to use latest available version (2.10.378)
2. **ESLint Config**: May need to update to flat config or use legacy mode
3. **Tailwind Config**: May need migration to Tailwind 4 format

## Testing Checklist

After updating dependencies, test:
- [ ] Build succeeds (`pnpm build`)
- [ ] Dev server starts (`pnpm dev`)
- [ ] React components render correctly
- [ ] PDF extraction works
- [ ] IndexedDB operations work
- [ ] LLM API calls work
- [ ] ESLint runs without errors
- [ ] TypeScript compilation succeeds

## Rollback Plan

If issues arise, you can temporarily pin to previous versions:
- React: `^18.2.0`
- Vite: `^5.0.11`
- Tailwind: `^3.4.1`
- Zod: `^3.22.4`
