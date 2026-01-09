# 🚀 Quick Cheat Sheet - Frontend Changes

## ⚡ **Most Common Changes (Copy-Paste Ready)**

### **1. Change StatCard Color**
**File**: `src/pages/Dashboard.tsx`
```tsx
<StatCard
  title="Usage"
  color="purple"  // Change: blue, green, orange, indigo, yellow
/>
```

### **2. Change Heading Text**
**File**: `src/pages/Settings.tsx` (line 186)
```tsx
<h1 className="text-2xl font-semibold">Your New Title</h1>
```

### **3. Change Heading Size**
```tsx
// text-lg → text-xl → text-2xl → text-3xl → text-4xl
<h1 className="text-3xl font-semibold">Settings</h1>
```

### **4. Change Button Color**
```tsx
// Find: bg-indigo-600 hover:bg-indigo-500
// Replace with:
className="... bg-blue-600 ... hover:bg-blue-500"
// Or: bg-green-600 hover:bg-green-500
// Or: bg-red-600 hover:bg-red-500
```

### **5. Change Background Color**
```tsx
// Find: bg-white or bg-slate-50
// Replace with:
className="bg-blue-50"  // Light blue
className="bg-indigo-100"  // Light indigo
```

### **6. Change Text Color**
```tsx
// Find: text-slate-700 or text-slate-900
// Replace with:
className="text-blue-600"  // Blue text
className="text-red-600"   // Red text
className="text-green-700" // Green text
```

---

## 📍 **File Locations**

| Change | File | Line |
|--------|------|------|
| StatCard colors | `Dashboard.tsx` | ~342-390 |
| Page title | `TopBar.tsx` | 29 |
| Settings heading | `Settings.tsx` | 186 |
| Sidebar color | `AppShell.tsx` | 69 |
| Button colors | `Settings.tsx` | 321, 446 |

---

## 🎨 **Tailwind Colors**

```
red, orange, yellow, green, blue, indigo, purple, pink
slate (gray), gray, zinc, neutral, stone
```

**Shades**: `50` (lightest) → `500` (medium) → `900` (darkest)

**Examples**:
- `bg-blue-50` - Very light blue
- `bg-blue-500` - Medium blue
- `bg-blue-900` - Dark blue
- `text-blue-600` - Blue text
- `hover:bg-blue-700` - Darker blue on hover

---

## 🔍 **Quick Find (Ctrl+F)**

- **"Usage"** → StatCard title
- **"Settings"** → Page heading
- **"bg-indigo"** → Button/background colors
- **"text-2xl"** → Font sizes
- **"StatCard"** → Card components

---

## ✅ **Checklist Before Submitting**

- [ ] File saved (Ctrl+S)
- [ ] Browser refreshed
- [ ] No syntax errors (check console)
- [ ] Change is visible on screen

---

**Remember**: Most changes = Find the line → Change the class/prop → Save!

