# Edit Material and Labor Feature Implementation

## Overview
Implemented edit functionality for both material and labor items in the On-Site Estimate Modal, allowing users to modify existing items instead of only adding new ones.

## Changes Made

### 1. Component State (`on-site-estimate-modal.component.ts`)

Added new signals to track editing state:
```typescript
readonly editingMaterialIndex = signal<number | null>(null); // Track which material is being edited
readonly editingLaborIndex = signal<number | null>(null); // Track which labor is being edited
```

## Material Editing

### Methods

#### `editMaterial(index: number)`
- Populates the material form with existing material data
- Sets the `editingMaterialIndex` signal
- Scrolls to the form for better UX
- Triggered when the user clicks the edit icon next to a material

#### `cancelEditMaterial()`
- Clears the editing state
- Resets the material form to default values
- Triggered when the user clicks "Cancel" during editing

#### Updated `addMaterial()`
- Now handles both adding new materials and updating existing ones
- Checks `editingMaterialIndex()` to determine the operation mode
- Preserves `detailKey` when updating existing materials (important for backend updates)
- Shows appropriate success message ("Material added" vs "Material updated")

#### Updated `removeMaterial(index: number)`
- Clears editing state if the user removes the material currently being edited
- Resets the form when this happens

### Template Changes (`on-site-estimate-modal.component.html`)

#### Dynamic Button Text
The "Add Material" button now changes its label based on editing state:
```html
{{ editingMaterialIndex() !== null ? 'Update Material' : 'Add Material' }}
```

#### Cancel Button
Added a conditional cancel button that only appears when editing:
```html
@if (editingMaterialIndex() !== null) {
  <button 
    type="button" 
    class="btn btn--outline"
    (click)="cancelEditMaterial()"
  >
    Cancel
  </button>
}
```

#### Edit Icon
Added an edit button (⚙️) next to each material item in the list

## Labor Editing

### Methods

#### `editLabor(index: number)`
- Populates the labor form with existing labor data (category, rate type, tech count, hours, rate, description)
- Sets the `editingLaborIndex` signal
- Scrolls to the form for better UX
- Triggered when the user clicks the edit icon next to a labor item

#### `cancelEditLabor()`
- Clears the editing state
- Resets the labor form to default values
- Triggered when the user clicks "Cancel" during editing

#### Updated `addLabor()`
- Now handles both adding new labor items and updating existing ones
- Checks `editingLaborIndex()` to determine the operation mode
- Preserves `detailKey` when updating existing labor items (important for backend updates)
- Shows appropriate success message ("Labor added" vs "Labor updated")

#### Updated `removeLabor(index: number)`
- Clears editing state if the user removes the labor item currently being edited
- Resets the form when this happens

### Template Changes (`on-site-estimate-modal.component.html`)

#### Dynamic Button Text
The "Add Labor" button now changes its label based on editing state:
```html
{{ editingLaborIndex() !== null ? 'Update Labor' : 'Add Labor' }}
```

#### Cancel Button
Added a conditional cancel button that only appears when editing:
```html
@if (editingLaborIndex() !== null) {
  <button 
    type="button" 
    class="btn btn--outline"
    (click)="cancelEditLabor()"
  >
    Cancel
  </button>
}
```

#### Edit Icon
Added an edit button (⚙️) next to each labor item in the list

## User Flows

### Adding a New Material/Labor (existing flow)
1. Fill in the form
2. Click "Add Material" or "Add Labor"
3. Item is added to the list
4. Form is reset

### Editing an Existing Material/Labor (new flow)
1. Click the edit icon (⚙️) next to an item in the list
2. Form automatically populates with the item's data
3. Button changes from "Add X" to "Update X"
4. Cancel button appears
5. Modify the values as needed
6. Click "Update X" to save changes
   - OR click "Cancel" to discard changes
7. Item is updated in the list with `detailKey` preserved
8. Form is reset and returns to "Add X" mode

## Key Features

### Data Preservation
- **`detailKey` preservation**: When updating an item that was loaded from the backend (in edit mode), the `detailKey` is preserved. This ensures the backend updates the correct record instead of creating a new one.

### UX Enhancements
- **Auto-scroll**: When editing an item, the form automatically scrolls into view
- **Visual feedback**: Button text changes to clearly indicate the current operation
- **Cancel option**: Users can abort an edit operation without affecting the existing item
- **Edit icons**: Clear visual indicators for which items can be edited

### Consistency with Trip Charge Edit Flow
This implementation follows the same pattern established for trip charge editing:
- State tracking with signals
- Form population from existing data
- `detailKey` preservation
- Clear visual indicators

## Testing Notes

### Test Scenarios for Both Material and Labor

1. **Add new item**: Verify items can still be added normally
2. **Edit existing item**: 
   - Click edit icon
   - Verify form populates correctly with all fields
   - Verify button changes to "Update X"
   - Verify cancel button appears
3. **Update item**: 
   - Make changes
   - Click "Update X"
   - Verify changes are reflected in the list
4. **Cancel edit**:
   - Click edit icon
   - Make changes
   - Click "Cancel"
   - Verify form resets and item remains unchanged
5. **Remove while editing**:
   - Click edit icon
   - Click remove on the same item
   - Verify form resets and editing state clears
6. **Edit mode persistence**:
   - In edit mode (editing an existing estimate)
   - Edit an item that has a `detailKey`
   - Verify the `detailKey` is preserved in the update
7. **Multiple edits**:
   - Edit item A
   - Edit item B (without saving A)
   - Verify form switches to item B's data
8. **Labor-specific fields**:
   - Verify labor category (Main Tech/Helper) is correctly populated
   - Verify rate type (Standard/Overtime) is correctly populated
   - Verify tech count, hours, and hourly rate are correctly populated
   - Verify work description is correctly populated

## Integration with Backend

When in edit mode (`isEditMode()` is true):
- Items loaded via `loadEstimateForEdit()` will have their `detailKey` attached
- When updating an item with a `detailKey`, it signals to the backend that this is an update operation
- New items added during editing won't have a `detailKey` (backend uses `Guid.Empty`)
- The `updateExistingEstimate()` method handles the conversion and API call

## Summary

Both material and labor items now support full CRUD operations:
- ✅ **Create**: Add new items
- ✅ **Read**: View items in the list
- ✅ **Update**: Edit existing items
- ✅ **Delete**: Remove items

This provides a complete and consistent editing experience across all line item types in the estimate modal.
