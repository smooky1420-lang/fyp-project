# Frontend Quick Reference Guide - Exam Tips

## 🎯 **Common Changes You Might Be Asked to Make**

This guide helps you quickly make common frontend modifications during your exam/presentation.

---

## 📍 **1. Changing Colors**

### **StatCard Colors** (`src/components/StatCard.tsx`)

The `StatCard` component uses predefined color schemes. To change a card's color:

**Location**: `src/pages/Dashboard.tsx` (around line 342-356)

**Current code:**
```tsx
<StatCard
  title="Usage"
  value={...}
  color="blue"  // ← Change this
/>
```

**Available colors**: `"green"`, `"blue"`, `"orange"`, `"purple"`, `"indigo"`, `"yellow"`

**Example change:**
```tsx
<StatCard
  title="Usage"
  value={...}
  color="purple"  // Changed from "blue" to "purple"
/>
```

### **Custom Colors (Tailwind Classes)**

If you need a custom color, you can use Tailwind classes directly:

**In StatCard component** (line 60):
```tsx
// Change text color
<div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
//                                                      ^^^^^^^^^^^^
// Change to: text-red-600, text-blue-500, text-green-700, etc.
```

**Common Tailwind color classes:**
- `text-red-600` - Red text
- `text-blue-500` - Blue text
- `text-green-700` - Green text
- `bg-red-100` - Light red background
- `bg-blue-500` - Blue background
- `ring-red-200` - Red border

### **TopBar Background** (`src/components/TopBar.tsx`)

**Line 26**: Change the background color
```tsx
<div className="sticky top-0 z-40 bg-slate-50/80 backdrop-blur">
//                                    ^^^^^^^^^^^^
// Change to: bg-blue-50, bg-white, bg-indigo-50, etc.
```

### **Sidebar Colors** (`src/components/AppShell.tsx`)

**Line 69**: Sidebar background
```tsx
<aside className="w-16 md:w-64 h-screen fixed top-0 left-0 bg-white ring-1 ring-slate-200">
//                                                                  ^^^^^^^
// Change to: bg-slate-50, bg-blue-50, etc.
```

**Line 73**: Brand logo background
```tsx
<div className="h-10 w-10 rounded-xl bg-indigo-600 text-white">
//                                        ^^^^^^^^^^^
// Change to: bg-blue-600, bg-red-600, bg-green-600, etc.
```

**Line 104**: Logout button
```tsx
className="w-full rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800"
//                              ^^^^^^^^^^^                    ^^^^^^^^^^^^
// Change both: bg-blue-600 hover:bg-blue-700, etc.
```

---

## 📝 **2. Changing Headings/Text**

### **Page Title** (`src/components/TopBar.tsx`)

**Line 29**: Main page title
```tsx
<div className="font-semibold text-lg">{pageTitle}</div>
//                              ^^^^^^
// Change size: text-xl, text-2xl, text-3xl
```

**To change the actual text**, modify `pageTitleFromPath()` function (line 41-50):
```tsx
function pageTitleFromPath(pathname: string) {
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  //                                        ^^^^^^^^^^
  // Change to: "My Dashboard", "Energy Monitor", etc.
```

### **StatCard Title** (`src/pages/Dashboard.tsx`)

**Line 343**: Change card title
```tsx
<StatCard
  title="Usage"  // ← Change this
  value={...}
/>
```

**Example:**
```tsx
<StatCard
  title="Power Consumption"  // Changed
  value={...}
/>
```

### **Settings Page Heading** (`src/pages/Settings.tsx`)

**Line 186**: Main heading
```tsx
<h1 className="text-2xl font-semibold">Settings</h1>
//                              ^^^^^^
// Change text: "User Settings", "Configuration", etc.
// Change size: text-3xl, text-xl, etc.
```

---

## 🎨 **3. Changing Button Colors**

### **Primary Buttons** (Settings page, line 321)

```tsx
className="rounded-xl bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-500"
//                              ^^^^^^^^^^^                    ^^^^^^^^^^^^
// Change both: bg-blue-600 hover:bg-blue-500
//              bg-green-600 hover:bg-green-500
//              bg-red-600 hover:bg-red-500
```

### **Secondary Buttons** (Dashboard, line 404)

```tsx
className="rounded-xl bg-slate-900 text-white px-3 py-2 text-sm hover:bg-slate-800"
//                              ^^^^^^^^^^^                    ^^^^^^^^^^^^
// Change to: bg-blue-900 hover:bg-blue-800, etc.
```

---

## 🔤 **4. Changing Font Sizes**

### **Common Tailwind Font Size Classes:**

- `text-xs` - Extra small (12px)
- `text-sm` - Small (14px)
- `text-base` - Base (16px) - default
- `text-lg` - Large (18px)
- `text-xl` - Extra large (20px)
- `text-2xl` - 2X large (24px)
- `text-3xl` - 3X large (30px)

### **Example Changes:**

**StatCard value** (line 60 in StatCard.tsx):
```tsx
<div className="mt-2 text-2xl font-semibold tabular-nums text-slate-900">
//                              ^^^^^^^
// Change to: text-xl, text-3xl, etc.
```

**StatCard title** (line 56):
```tsx
<div className={`text-sm ${titleColorClass} font-medium`}>
//              ^^^^^^
// Change to: text-base, text-lg, etc.
```

---

## 🎯 **5. Quick Change Locations**

### **Most Common Files to Edit:**

1. **`src/pages/Dashboard.tsx`** - Main dashboard
   - StatCard colors (line 347, 355, 388)
   - Card titles (line 343, 351, 378)
   - Button colors (line 404)

2. **`src/components/StatCard.tsx`** - Card component
   - Color definitions (line 3-28)
   - Font sizes (line 56, 60)

3. **`src/components/TopBar.tsx`** - Top navigation bar
   - Page title (line 29)
   - Background color (line 26)
   - Button colors (line 36, 50)

4. **`src/components/AppShell.tsx`** - Main layout
   - Sidebar colors (line 69, 73, 104)
   - Brand name (line 77)

5. **`src/pages/Settings.tsx`** - Settings page
   - Headings (line 186, 194)
   - Button colors (line 321, 446)

---

## ⚡ **6. Quick Tips for Exams**

### **Tip 1: Use VS Code Search (Ctrl+F)**
- Search for the text you want to change (e.g., "Usage", "Settings")
- Find the exact line quickly

### **Tip 2: Tailwind Color Reference**
Remember common Tailwind colors:
- **Red**: `red-50` (lightest) to `red-900` (darkest)
- **Blue**: `blue-50` to `blue-900`
- **Green**: `green-50` to `green-900`
- **Indigo**: `indigo-50` to `indigo-900`
- **Slate/Gray**: `slate-50` to `slate-900`

### **Tip 3: Component Props**
If asked to change a StatCard:
1. Find where it's used (usually Dashboard.tsx)
2. Change the `color` prop: `color="blue"` → `color="purple"`
3. Change the `title` prop: `title="Usage"` → `title="Power"`

### **Tip 4: CSS Classes Pattern**
Tailwind uses this pattern:
- `bg-{color}-{shade}` - Background
- `text-{color}-{shade}` - Text color
- `ring-{color}-{shade}` - Border
- `hover:bg-{color}-{shade}` - Hover state

### **Tip 5: Common Requests**
- **"Change the heading color"** → Look for `text-` classes
- **"Change the background"** → Look for `bg-` classes
- **"Make text bigger"** → Change `text-lg` to `text-xl` or `text-2xl`
- **"Change button color"** → Find button `className` with `bg-` and `hover:bg-`

---

## 🔍 **7. Finding Code Quickly**

### **Search Patterns:**

**To find a heading:**
- Search for: `"Settings"`, `"Dashboard"`, `"Usage"`, etc.

**To find colors:**
- Search for: `"bg-indigo"`, `"text-blue"`, `"color="blue"`

**To find buttons:**
- Search for: `"button"`, `"onClick"`, `"Save"`

**To find StatCards:**
- Search for: `"StatCard"` or `"<StatCard"`

---

## 📋 **8. Common Exam Scenarios**

### **Scenario 1: "Change the Usage card to red"**
1. Open `src/pages/Dashboard.tsx`
2. Find line 342-348 (StatCard with title="Usage")
3. Change `color="blue"` to `color="orange"` (or modify colorClasses in StatCard.tsx)

### **Scenario 2: "Make the Settings heading larger"**
1. Open `src/pages/Settings.tsx`
2. Find line 186: `<h1 className="text-2xl font-semibold">Settings</h1>`
3. Change `text-2xl` to `text-3xl` or `text-4xl`

### **Scenario 3: "Change the sidebar background to blue"**
1. Open `src/components/AppShell.tsx`
2. Find line 69: `bg-white`
3. Change to `bg-blue-50` or `bg-blue-100`

### **Scenario 4: "Change button color to green"**
1. Find the button (search for "Save" or "button")
2. Look for `bg-indigo-600` or `bg-slate-900`
3. Change to `bg-green-600` and `hover:bg-green-500`

### **Scenario 5: "Change page title text"**
1. Open `src/components/AppShell.tsx`
2. Find `pageTitleFromPath()` function (line 41)
3. Change return values (e.g., `"Dashboard"` → `"Energy Monitor"`)

---

## 🛠️ **9. Testing Your Changes**

After making changes:
1. **Save the file** (Ctrl+S)
2. **Check the browser** - Vite auto-refreshes
3. **If it doesn't update**: 
   - Check browser console for errors
   - Make sure you saved the file
   - Check syntax (quotes, brackets)

---

## 💡 **10. Pro Tips**

1. **Don't panic** - Most changes are simple find-and-replace
2. **Use the file explorer** - Know where files are located
3. **Read the code** - Understand what you're changing
4. **Test incrementally** - Make one change, test, then continue
5. **Use comments** - If you're unsure, add a comment explaining the change

---

## 📚 **Quick Tailwind Reference**

### **Colors:**
```
red, orange, yellow, green, blue, indigo, purple, pink
slate (gray), gray, zinc, neutral, stone
```

### **Shades:**
```
50 (lightest), 100, 200, 300, 400, 500 (medium), 
600, 700, 800, 900 (darkest)
```

### **Common Combinations:**
- Light background: `bg-{color}-50` or `bg-{color}-100`
- Medium text: `text-{color}-600` or `text-{color}-700`
- Dark background: `bg-{color}-600` or `bg-{color}-700`
- Light text on dark: `text-white` or `text-{color}-50`

---

**Good luck! Remember: Most changes are just finding the right line and changing a class name or prop value.** 🚀

