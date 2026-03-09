

## Fix: Add vertical scroll to Step 3 (Permissions) in CreateUserWizard

**Problem**: The permissions step (Step 2) in the "Nuovo Utente" wizard overflows the dialog without showing a scrollbar, making Marketing permissions and the "Only Assigned" toggle inaccessible.

**Root cause**: The `ScrollArea` component on line 227 has `className="flex-1 pr-4"` but lacks `overflow-y-auto` behavior because it needs an explicit height constraint within the flex container.

**Fix**: Add `overflow-hidden` to the `ScrollArea` wrapper and set `min-h-0` so the flex child properly constrains its height, allowing Radix ScrollArea to calculate its viewport correctly.

**Change**: In `src/components/users/CreateUserWizard.tsx`, line 227:
```tsx
// Before
<ScrollArea className="flex-1 pr-4">

// After  
<ScrollArea className="flex-1 min-h-0 pr-4">
```

This single change ensures the flex child shrinks properly within `max-h-[85vh]`, enabling the scrollbar for all permission sections including Marketing.

