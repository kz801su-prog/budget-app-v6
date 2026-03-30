
// Simulate the sparse array behavior
const row = [];
row[0] = "Code";
row[2] = "Subject"; // Index 1 is empty

// Original buggy logic
try {
    const rowStr = row.map(c => String(c).toLowerCase().trim());
    console.log("RowStr:", rowStr);

    const requiredColumns = {
        subject: ['subject']
    };

    // Simulate findIndex
    const idx = rowStr.findIndex(cell => {
        // This was the crash: cell is undefined for the empty slot
        const variations = requiredColumns.subject;
        return variations.some(v => cell === v || cell.includes(v));
    });
    console.log("Original: Success idx", idx);
} catch (e) {
    console.log("Original: Crashed as expected:", e.message);
}

// Fixed logic test
try {
    // Array.from fills holes with undefined, allowing map to see them
    const rowStrSafe = Array.from(row).map(c => (c !== undefined && c !== null) ? String(c).toLowerCase().trim() : "");
    console.log("SafeRowStr:", rowStrSafe);

    const requiredColumns = {
        subject: ['subject']
    };

    const idx = rowStrSafe.findIndex(cell => {
        const variations = requiredColumns.subject;
        // checking cell && ... is now redundant if we guarantee string, but good for safety
        return cell && variations.some(v => cell === v || cell.includes(v));
    });
    console.log("Fixed: Success idx", idx);
} catch (e) {
    console.log("Fixed: Crashed (Unexpected):", e.message);
}
