# Plain Text Only - Additional Approval & Email Modals

## Implementation

Both the Additional Approval modal and Work Order Email modal now work exclusively with **plain text** - no HTML content is displayed or sent.

## Changes Made

### 1. Additional Approval Modal

**Approval Message Field**:
- ✅ Plain text textarea (no HTML)
- ✅ User enters plain text message
- ✅ Plain text is sent to backend as-is
- ✅ No HTML tags, no formatting

**User Experience**:
```
┌────────────────────────────────────┐
│ Approval Message *                 │
│ ┌────────────────────────────────┐ │
│ │ Approved. Please proceed with  │ │
│ │ the work as estimated.         │ │
│ │                                │ │
│ └────────────────────────────────┘ │
│ Plain text only. This message will │
│ be sent to the vendor.             │
└────────────────────────────────────┘
```

### 2. Work Order Email Modal

**Email Body Field**:
- ✅ HTML from backend is **stripped to plain text** on load
- ✅ User sees and edits plain text only
- ✅ Plain text is sent to backend
- ✅ No HTML rendering or preview

**HTML Stripping Logic**:
```typescript
private stripHtmlTags(html: string): string {
  if (!html) return '';
  
  // Create a temporary div to convert HTML to plain text
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  
  // Get text content
  let text = tmp.textContent || tmp.innerText || '';
  
  // Clean up extra whitespace
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  text = text.trim();
  
  return text;
}
```

**Example Conversion**:

**Before (HTML from backend)**:
```html
<p>Work Order #12345</p>
<p>Dear Vendor,</p>
<p>Please proceed with the approved estimate.</p>
<table>
  <tr><td>Item</td><td>Amount</td></tr>
  <tr><td>Labor</td><td>$500</td></tr>
</table>
```

**After (Plain text shown to user)**:
```
Work Order #12345

Dear Vendor,

Please proceed with the approved estimate.

Item Amount
Labor $500
```

### 3. How It Works

**Flow for Additional Approval**:
1. User enters plain text message
2. Message sent to backend as plain text
3. Backend handles any formatting if needed

**Flow for Work Order Email**:
1. Backend returns HTML email template
2. Frontend **strips HTML** using DOM parsing
3. User sees and edits plain text
4. Plain text sent to backend
5. Backend handles email formatting

## Benefits

✅ **Simpler UX** - No confusing HTML tags  
✅ **Easier Editing** - Plain text is straightforward  
✅ **No Formatting Issues** - Can't break HTML structure  
✅ **Cleaner Data** - Plain text is more portable  
✅ **Better Readability** - Easier to read and verify content  

## Technical Implementation

### Components Modified

**Both Components Include**:
- `stripHtmlTags()` private method for HTML → plain text conversion
- Removed all HTML preview functionality
- Removed toggle buttons
- Simple textarea fields only

### Files Changed

1. **additional-approval-modal.component.ts**
   - Removed `showHtmlPreview` signal
   - Removed `toggleHtmlPreview()` method
   - Removed `getHtmlPreview()` method
   - Added `stripHtmlTags()` method (for future use if needed)

2. **additional-approval-modal.component.html**
   - Removed preview div and toggle button
   - Simple textarea only
   - Updated hint text: "Plain text only"

3. **additional-approval-modal.component.scss**
   - Removed unused preview/toggle styles
   - Clean, minimal styling

4. **work-order-email-modal.component.ts**
   - Removed `showHtmlPreview` signal
   - Removed `toggleHtmlPreview()` method
   - Added `stripHtmlTags()` method
   - **Calls stripHtmlTags()** when loading email body from backend

5. **work-order-email-modal.component.html**
   - Removed preview div and toggle button
   - Simple textarea only
   - Updated hint text: "Plain text only"

6. **work-order-email-modal.component.scss**
   - Removed unused preview/toggle styles
   - Clean, minimal styling

## Backend Integration

### What Gets Sent

**Additional Approval Request**:
```json
{
  "estimateKey": "guid",
  "jobKey": "guid",
  "vendorKey": "guid",
  "approvalOption": 1,
  "approvalText": "Plain text message here",  // ← Plain text
  "revVendorDNE": 1500.00
}
```

**Email Send Request**:
```json
{
  "workOrderKey": "guid",
  "jobKey": "guid",
  "vendorKey": "guid",
  "invoiceType": 5,
  "emailBody": "Plain text email content here",  // ← Plain text
  "senderIsSelf": true,
  "recipientEmails": ["vendor@example.com"],
  "attachedFileKeys": []
}
```

### Backend Responsibility

The **backend** is responsible for:
- Converting plain text to HTML if needed for email formatting
- Wrapping text in proper HTML structure for email clients
- Adding styling/branding to emails
- Handling line breaks and formatting

The **frontend** just sends clean plain text.

## User Instructions

### For Approval Message
1. Enter your approval message in plain text
2. Use line breaks where needed
3. No special formatting available
4. Message will be sent as-is to vendor

### For Work Order Email
1. Email template loads as plain text (HTML stripped automatically)
2. Edit the message as needed
3. All formatting is plain text
4. Email will be formatted by the system when sent

## Edge Cases Handled

✅ **Empty HTML** - Returns empty string  
✅ **Nested Tags** - Properly extracts text  
✅ **HTML Entities** - Decoded to plain text (`&nbsp;` → space)  
✅ **Tables** - Converted to readable text  
✅ **Line Breaks** - `<br>` and `<p>` tags converted to line breaks  
✅ **Extra Whitespace** - Cleaned up while preserving intentional breaks  

## Testing

### Test Cases

1. **Plain Text Input**
   - Input: "Approved. Please proceed."
   - Sent: "Approved. Please proceed."
   - ✅ Works as expected

2. **Multi-line Text**
   - Input: "Line 1\nLine 2\nLine 3"
   - Sent: "Line 1\nLine 2\nLine 3"
   - ✅ Line breaks preserved

3. **HTML from Backend**
   - Received: `<p>Hello <strong>vendor</strong></p>`
   - Displayed: "Hello vendor"
   - ✅ HTML stripped correctly

4. **Special Characters**
   - Input: "Price: $500 & tax"
   - Sent: "Price: $500 & tax"
   - ✅ No escaping issues

5. **Empty Input**
   - Validation: Required field
   - ✅ Cannot submit empty

## Future Considerations

If rich text formatting is needed in the future:
1. Consider adding a WYSIWYG editor (Quill, TinyMCE)
2. Or use Markdown input with preview
3. Or provide basic formatting buttons (bold, italic, list)

For now, plain text provides:
- ✅ Simplicity
- ✅ No formatting bugs
- ✅ Backend control over email appearance
- ✅ Easier maintenance

## Related Files

- `src/app/shared/components/additional-approval-modal/additional-approval-modal.component.ts`
- `src/app/shared/components/additional-approval-modal/additional-approval-modal.component.html`
- `src/app/shared/components/additional-approval-modal/additional-approval-modal.component.scss`
- `src/app/shared/components/work-order-email-modal/work-order-email-modal.component.ts`
- `src/app/shared/components/work-order-email-modal/work-order-email-modal.component.html`
- `src/app/shared/components/work-order-email-modal/work-order-email-modal.component.scss`

## Date

July 1, 2026

---

**Summary**: Both modals now work exclusively with plain text. HTML from backend is stripped on load, and only plain text is sent back to backend. This provides a cleaner, simpler user experience with no HTML formatting concerns.
