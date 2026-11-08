/* ============================================================
   RESELLER B2SS2B BREAKUP — CORE APP LOGIC (CLEANED + FIXED)
   ============================================================ */

/* -----------------------------
   SECTION NAVIGATION
----------------------------- */
const navButtons = document.querySelectorAll(".nav-btn");
const panels = document.querySelectorAll(".panel");

navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
        navButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        const target = btn.dataset.section;

        panels.forEach(panel => {
            panel.classList.remove("active");
            if (panel.id === target) panel.classList.add("active");
        });
    });
});

/* -----------------------------
   LOCAL STORAGE WRAPPER
----------------------------- */
const Storage = {
    save(key, data) {
        localStorage.setItem(key, JSON.stringify(data));
    },
    load(key, fallback = []) {
        const raw = localStorage.getItem(key);
        if (!raw) return fallback;
        try {
            return JSON.parse(raw);
        } catch {
            return fallback;
        }
    },
    clear(key) {
        localStorage.removeItem(key);
    }
};

/* -----------------------------
   DATA MODELS
----------------------------- */
let sales = Storage.load("sales");
let purchases = Storage.load("purchases");
let recurringExpenses = Storage.load("recurringExpenses");
let salaryEntries = Storage.load("salaryEntries");
let salaryGoal = Storage.load("salaryGoal", 0);
let archiveMonths = Storage.load("archiveMonths");
let parentPurchases = Storage.load("parentPurchases", []);

// NEW: dynamic split + starting balance
let splitSourcing = Storage.load("splitSourcing", 75);   // %
let splitSavings  = Storage.load("splitSavings", 25);    // %
let startingBalance = Storage.load("startingBalance", 0); // carry-over savings pool

/* -----------------------------
   DATA NORMALIZATION
----------------------------- */
function normalizeData() {
    // IDs already counted in an archived month (migration for data saved
    // before the counted flag existed — archived purchases must never be
    // counted again in a later month's totals)
    const archivedPurchaseIds = new Set();
    const archivedParentIds = new Set();
    archiveMonths.forEach(a => {
        (a.purchases || []).forEach(p => { if (p.id) archivedPurchaseIds.add(p.id); });
        (a.parentPurchases || []).forEach(p => { if (p.id) archivedParentIds.add(p.id); });
    });

    purchases = purchases.map(p => {
        if (!p.id) p.id = crypto.randomUUID();
        if (typeof p.counted !== "boolean") p.counted = archivedPurchaseIds.has(p.id);
        if (typeof p.remainingQty !== "number") {
            p.remainingQty = typeof p.qty === "number" ? p.qty : 0;
        }
        return p;
    });

    sales = sales.map(s => {
        if (!s.id) s.id = crypto.randomUUID();
        if (typeof s.platform === "undefined") s.platform = "";
        if (typeof s.purchaseId === "undefined") s.purchaseId = null;
        if (typeof s.autoCogs === "undefined") s.autoCogs = false;
        return s;
    });

    parentPurchases = parentPurchases.map(p => {
        if (!p.id) p.id = crypto.randomUUID();
        if (typeof p.counted !== "boolean") p.counted = archivedParentIds.has(p.id);
        if (!Array.isArray(p.subPurchases)) p.subPurchases = [];
        if (typeof p.buyerPremiumPercent !== "number") p.buyerPremiumPercent = 0;
        if (typeof p.buyerPremiumAmount !== "number") p.buyerPremiumAmount = 0;
        if (typeof p.totalHammer !== "number") p.totalHammer = 0;
        if (typeof p.totalPremium !== "number") p.totalPremium = 0;
        if (typeof p.totalCost !== "number") p.totalCost = 0;
        if (typeof p.totalQty !== "number") p.totalQty = 0;
        if (typeof p.costPerItem !== "number") p.costPerItem = 0;

        p.subPurchases = p.subPurchases.map(l => {
            if (!l.id) l.id = crypto.randomUUID();
            if (!l.parentId) l.parentId = p.id;
            if (typeof l.hammerPrice !== "number") l.hammerPrice = 0;
            if (typeof l.qty !== "number") l.qty = 0;
            if (typeof l.premiumShare !== "number") l.premiumShare = 0;
            if (typeof l.totalCost !== "number") l.totalCost = l.hammerPrice + l.premiumShare;
            if (typeof l.costPerItem !== "number") {
                l.costPerItem = l.qty > 0 ? l.totalCost / l.qty : 0;
            }
            if (typeof l.remainingQty !== "number") l.remainingQty = l.qty;

            // ⭐ ADDED — initialize lot profit tracking (TEMPORARY)
            if (typeof l.totalProfit !== "number") l.totalProfit = -l.totalCost;
            if (typeof l.remainingCost !== "number") l.remainingCost = l.totalCost;

            return l;
        });

        return p;
    });

    // ⭐ NEW — normalize recurringExpenses.paid
    recurringExpenses = recurringExpenses.map(r => {
        if (typeof r.paid !== "boolean") r.paid = false;
        return r;
    });

    Storage.save("purchases", purchases);
    Storage.save("sales", sales);
    Storage.save("parentPurchases", parentPurchases);
    Storage.save("recurringExpenses", recurringExpenses);
}

/* -----------------------------
   HELPERS
----------------------------- */
function findPurchaseById(id) {
    return purchases.find(p => p.id === id) || null;
}

function findLotById(lotId) {
    for (const parent of parentPurchases) {
        const lot = parent.subPurchases.find(l => l.id === lotId);
        if (lot) return { parent, lot };
    }
    return null;
}

/* -----------------------------
   SPLIT SETTINGS (NEW)
----------------------------- */
function updateSplitSettings(newSourcing, newSavings) {
    const s = Number(newSourcing) || 0;
    const sv = Number(newSavings) || 0;

    if (s < 0 || sv < 0 || (s + sv) !== 100) {
        alert("Split must be positive and total 100%.");
        return;
    }

    splitSourcing = s;
    splitSavings = sv;

    Storage.save("splitSourcing", splitSourcing);
    Storage.save("splitSavings", splitSavings);

    updateSummary();
}

/* -----------------------------
   SALES — ADD MANUAL ENTRY
----------------------------- */
function addSale() {
    const item = document.getElementById("manual-item").value.trim();
    const qty = Number(document.getElementById("manual-qty").value) || 0;
    const total = Number(document.getElementById("manual-total").value) || 0;
    const sellingCost = Number(document.getElementById("manual-cost").value) || 0;
    const cogs = Number(document.getElementById("manual-cogs").value) || 0;
    const date = document.getElementById("manual-date").value.trim();
    const notes = document.getElementById("manual-notes").value.trim();
    const platformEl = document.getElementById("manual-platform");
    const platform = platformEl ? platformEl.value : "";

    if (!item || qty <= 0 || total <= 0) {
        alert("Please enter Item, Qty, and Total Sale Price.");
        return;
    }

    const profit = total - sellingCost - cogs;

    sales.push({
        id: crypto.randomUUID(),
        item,
        qty,
        total,
        sellingCost,
        cogs,
        profit,
        date,
        notes,
        platform,
        purchaseId: null,
        lotId: null,
        autoCogs: cogs === 0
    });

    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();

    document.getElementById("manual-item").value = "";
    document.getElementById("manual-qty").value = "";
    document.getElementById("manual-total").value = "";
    document.getElementById("manual-cost").value = "";
    document.getElementById("manual-cogs").value = "";
    document.getElementById("manual-date").value = "";
    document.getElementById("manual-notes").value = "";
    if (platformEl) platformEl.value = "";
}

/* -----------------------------
   SALES — LINK LOT TO SALE
----------------------------- */
function linkLotToSale(saleIndex, lotId) {
    const sale = sales[saleIndex];
    const found = findLotById(lotId);

    if (!sale || !found) return;

    const { parent, lot } = found;
    const qty = sale.qty || 0;

    if (lot.remainingQty < qty) {
        alert("Not enough remaining quantity in that lot.");
        return;
    }

    if (sale.purchaseId) {
        const old = findPurchaseById(sale.purchaseId);
        if (old) old.remainingQty += qty;
    }

    if (sale.lotId) {
        const oldLot = findLotById(sale.lotId);
        if (oldLot) oldLot.lot.remainingQty += qty;
    }

    sale.purchaseId = null;
    sale.lotId = lot.id;
    sale.autoCogs = true;

    sale.cogs = lot.costPerItem * qty;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    lot.remainingQty -= qty;

    // ⭐ ADDED — update lot profit tracking
    lot.totalProfit += sale.profit;
    lot.remainingCost -= (lot.costPerItem * qty);

    // ⭐ REQUIRED — recalc parent + lot math
    recalcParentTotals(parent);

    Storage.save("sales", sales);
    Storage.save("parentPurchases", parentPurchases);
    Storage.save("purchases", purchases);

    renderSalesTable();
    renderParentPurchaseTable();
    renderLotTable();
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   SALES — UNLINK
----------------------------- */
function unlinkPurchaseFromSale(saleIndex) {
    const sale = sales[saleIndex];
    if (!sale) return;

    const qty = sale.qty || 0;

    if (sale.purchaseId) {
        const p = findPurchaseById(sale.purchaseId);
        if (p) p.remainingQty += qty;
    }

    if (sale.lotId) {
        const found = findLotById(sale.lotId);
        if (found) {
            found.lot.remainingQty += qty;

            // ⭐ reverse lot profit tracking
            found.lot.totalProfit -= sale.profit;
            found.lot.remainingCost += (found.lot.costPerItem * qty);

            recalcParentTotals(found.parent);
        }
    }

    sale.purchaseId = null;
    sale.lotId = null;
    sale.autoCogs = false;
    sale.cogs = 0;
    sale.profit = sale.total - sale.sellingCost;

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    updateSummary();
}

/* -----------------------------
   SALES — INLINE COGS UPDATE
----------------------------- */
function updateCogsInline(index, newCogs) {
    const sale = sales[index];
    if (!sale) return;

    const cogs = Number(newCogs) || 0;
    sale.cogs = cogs;

    // ⭐ FIX: Recalculate profit correctly
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    // Manual COGS overrides autoCogs
    sale.autoCogs = false;

    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();
}

/* -----------------------------
   SALES — DELETE
----------------------------- */
function deleteSale(index) {
    const s = sales[index];
    const qty = s ? s.qty : 0;

    if (s.purchaseId) {
        const p = findPurchaseById(s.purchaseId);
        if (p) p.remainingQty += qty;
    }

    if (s.lotId) {
        const found = findLotById(s.lotId);
        if (found) {
            found.lot.remainingQty += qty;

            found.lot.totalProfit -= s.profit;
            found.lot.remainingCost += (found.lot.costPerItem * qty);

            recalcParentTotals(found.parent);
        }
    }

    sales.splice(index, 1);

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    updateSummary();
}

/* -----------------------------
   SALES — RENDER TABLE
----------------------------- */
function renderSalesTable() {
    const tbody = document.getElementById("sales-table-body");
    tbody.innerHTML = "";

    const simpleOptions = purchases
        .filter(p => p.remainingQty > 0)
        .map(p => ({
            type: "simple",
            id: p.id,
            label: `${p.item} — ${p.remainingQty} left — $${p.costPerItem.toFixed(2)} ea`
        }));

    const lotOptions = [];
    parentPurchases.forEach(parent => {
        parent.subPurchases.forEach(lot => {
            if (lot.remainingQty > 0) {
                lotOptions.push({
                    type: "lot",
                    id: lot.id,
                    parentName: parent.sourceName,
                    label: `Lot ${lot.lotNumber} — ${lot.remainingQty} left — $${lot.costPerItem.toFixed(2)} ea`
                });
            }
        });
    });

    sales.forEach((s, index) => {
        const row = document.createElement("tr");

        let linkLabel = "Link purchase";
        if (s.purchaseId) {
            const p = findPurchaseById(s.purchaseId);
            if (p) linkLabel = `${p.item} — ${p.remainingQty} left — $${p.costPerItem.toFixed(2)} ea`;
        }
        if (s.lotId) {
            const found = findLotById(s.lotId);
            if (found) {
                linkLabel = `${found.parent.sourceName} — Lot ${found.lot.lotNumber} — ${found.lot.remainingQty} left — $${found.lot.costPerItem.toFixed(2)} ea`;
            }
        }

        const selectId = `purchase-select-${index}`;

        row.innerHTML = `
            <td>${s.item}</td>
            <td>${s.platform || ""}</td>
            <td>${s.qty}</td>
            <td>$${s.total.toFixed(2)}</td>
            <td>$${s.sellingCost.toFixed(2)}</td>

            <td contenteditable="true"
                onblur="updateCogsInline(${index}, this.innerText.replace('$',''))">
                $${s.cogs.toFixed(2)}
            </td>

            <td>
                <select id="${selectId}" onchange="handlePurchaseSelectChange(${index}, this.value)">
                    <option value="">${linkLabel}</option>

                    <optgroup label="Parent Purchases (Lots)">
                        ${lotOptions.map(o => `
                            <option value="lot-${o.id}">
                                ${o.parentName} — ${o.label}
                            </option>
                        `).join("")}
                    </optgroup>

                    <optgroup label="Simple Purchases">
                        ${simpleOptions.map(o => `
                            <option value="simple-${o.id}">
                                ${o.label}
                            </option>
                        `).join("")}
                    </optgroup>
                </select>

                ${(s.purchaseId || s.lotId)
                    ? `<button class="delete-btn" onclick="unlinkPurchaseFromSale(${index})">Unlink</button>`
                    : ""}
            </td>

            <td style="color:${s.profit >= 0 ? '#4CAF50' : '#D9534F'};">
                $${s.profit.toFixed(2)}
            </td>

            <td><button class="delete-btn" onclick="deleteSale(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   HANDLE DROPDOWN CHANGE
----------------------------- */
function handlePurchaseSelectChange(saleIndex, value) {
    if (!value) {
        unlinkPurchaseFromSale(saleIndex);
        return;
    }

    if (value.startsWith("simple-")) {
        linkPurchaseToSale(saleIndex, value.replace("simple-", ""));
        return;
    }

    if (value.startsWith("lot-")) {
        linkLotToSale(saleIndex, value.replace("lot-", ""));
        return;
    }
}

/* -----------------------------
   CSV IMPORTER (CORRECTED)
----------------------------- */
function importCSV(file) {
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function (e) {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
        const rows = lines.map(line => parseCSVLine(line));

        const headerIndex = rows.findIndex(r => r[0] === "Listing title");
        if (headerIndex === -1) {
            alert("CSV format not recognized.");
            return;
        }

        for (let i = headerIndex + 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 4) continue;

            const item = (r[0] || "").trim();
            if (!item) continue;

            // ⭐ YOUR REAL CSV COLUMN ORDER:
            // 0 = Listing title
            // 1 = Quantity sold
            // 2 = Total sales (Includes taxes)
            // 3 = Total selling costs

            const qty = toNumber(r[1]);
            const totalSale = toNumber(r[2]);
            const sellingCost = toNumber(r[3]);

            const cogs = 0;
            const profit = totalSale - sellingCost - cogs;

            sales.push({
                id: crypto.randomUUID(),
                item,
                qty,
                total: totalSale,
                sellingCost,
                cogs,
                profit,
                date: "",
                notes: "",
                platform: "eBay",
                purchaseId: null,
                lotId: null,
                autoCogs: true
            });
        }

        Storage.save("sales", sales);
        renderSalesTable();
        updateSummary();
    };

    reader.readAsText(file);
}
/* -----------------------------
   CSV PARSER
----------------------------- */
function parseCSVLine(line) {
    const result = [];
    let current = "";
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const ch = line[i];

        if (ch === '"') {
            inQuotes = !inQuotes;
            continue;
        }

        if (ch === "," && !inQuotes) {
            result.push(current);
            current = "";
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function toNumber(str) {
    if (!str) return 0;
    const cleaned = String(str)
        .replace(/\$/g, "")
        .replace(/,/g, "")
        .replace(/\(/g, "-")
        .replace(/\)/g, "")
        .trim();
    const n = Number(cleaned);
    return isNaN(n) ? 0 : n;
}

/* -----------------------------
   SALARY — ADD ENTRY
----------------------------- */
function addSalaryEntry() {
    const amount = Number(document.getElementById("salary-amount").value) || 0;
    const date = document.getElementById("salary-date").value.trim();

    if (amount <= 0 || !date) {
        alert("Enter Amount and Date.");
        return;
    }

    salaryEntries.push({
        id: crypto.randomUUID(),
        amount,
        date,
        notes: ""
    });

    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSummary();
    updateSalaryTracker();

    document.getElementById("salary-amount").value = "";
    document.getElementById("salary-date").value = "";
}

/* -----------------------------
   SALARY — DELETE ENTRY
----------------------------- */
function deleteSalaryEntry(index) {
    salaryEntries.splice(index, 1);
    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSummary();
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — RENDER TABLE
----------------------------- */
function renderSalaryTable() {
    const tbody = document.getElementById("salary-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    salaryEntries.forEach((e, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${e.date}</td>
            <td>$${e.amount.toFixed(2)}</td>
            <td><button class="delete-btn" onclick="deleteSalaryEntry(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SALARY GOAL
----------------------------- */
function updateSalaryGoal() {
    const goal = Number(document.getElementById("salary-goal-input").value) || 0;
    salaryGoal = goal;
    Storage.save("salaryGoal", salaryGoal);
    updateSalaryTracker();
}

function loadSalaryGoal() {
    const el = document.getElementById("salary-goal-input");
    if (el) el.value = salaryGoal || 0;
}

/* -----------------------------
   SALARY TRACKER
----------------------------- */
function updateSalaryTracker() {
    const paid = salaryEntries.reduce((s, e) => s + e.amount, 0);
    const remaining = Math.max(0, salaryGoal - paid);

    const paidText = document.querySelector("#salary .card:nth-of-type(2) p:nth-of-type(1)");
    const remainingText = document.querySelector("#salary .card:nth-of-type(2) p:nth-of-type(2)");

    if (paidText) paidText.innerHTML = `<strong>Paid:</strong> $${paid.toFixed(2)}`;
    if (remainingText) remainingText.innerHTML = `<strong>Remaining:</strong> $${remaining.toFixed(2)}`;

    const bar = document.querySelector(".progress-fill");
    if (bar) {
        const pct = salaryGoal > 0 ? Math.min(100, (paid / salaryGoal) * 100) : 0;
        bar.style.width = pct + "%";
    }
}

/* -----------------------------
   PAY FULL SALARY
----------------------------- */
function payFullSalary() {
    if (salaryGoal <= 0) {
        alert("Set a salary goal first.");
        return;
    }

    const paid = salaryEntries.reduce((s, e) => s + e.amount, 0);
    const remaining = salaryGoal - paid;

    if (remaining <= 0) {
        alert("Goal already met.");
        return;
    }

    salaryEntries.push({
        id: crypto.randomUUID(),
        amount: remaining,
        date: new Date().toISOString().split("T")[0],
        notes: "Full goal auto-payment"
    });

    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSummary();
    updateSalaryTracker();
}

/* -----------------------------
   SIMPLE PURCHASES
----------------------------- */
function addPurchase() {
    const item = document.getElementById("purchase-item").value.trim();
    const amount = Number(document.getElementById("purchase-amount").value) || 0;
    const qty = Number(document.getElementById("purchase-qty").value) || 0;
    const date = document.getElementById("purchase-date").value.trim();
    const notes = document.getElementById("purchase-notes").value.trim();

    if (!item || amount <= 0 || qty <= 0) {
        alert("Please enter Item, Amount, and Quantity.");
        return;
    }

    const costPerItem = amount / qty;

    purchases.push({
        id: crypto.randomUUID(),
        item,
        amount,
        qty,
        remainingQty: qty,
        costPerItem,
        date,
        notes,
        counted: false
    });

    Storage.save("purchases", purchases);
    renderPurchaseTable();
    updateSummary();

    document.getElementById("purchase-item").value = "";
    document.getElementById("purchase-amount").value = "";
    document.getElementById("purchase-qty").value = "";
    document.getElementById("purchase-date").value = "";
    document.getElementById("purchase-notes").value = "";
}

function renderPurchaseTable() {
    const tbody = document.getElementById("purchase-table-body");
    tbody.innerHTML = "";

    purchases.forEach((p, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${p.item}</td>
            <td>$${p.amount.toFixed(2)}</td>
            <td>${p.qty}</td>
            <td>$${p.costPerItem.toFixed(2)}</td>
            <td>${p.date}</td>
            <td>${p.notes || ""}</td>
            <td><button class="delete-btn" onclick="deletePurchase(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

function deletePurchase(index) {
    purchases.splice(index, 1);
    Storage.save("purchases", purchases);
    renderPurchaseTable();
    updateSummary();
}

/* -----------------------------
   SALES — LINK SIMPLE PURCHASE TO SALE
----------------------------- */
function linkPurchaseToSale(saleIndex, purchaseId) {
    const sale = sales[saleIndex];
    const p = findPurchaseById(purchaseId);

    if (!sale || !p) return;

    const qty = sale.qty || 0;

    if (p.remainingQty < qty) {
        alert("Not enough remaining quantity in that purchase.");
        return;
    }

    // Undo previous links
    if (sale.purchaseId && sale.purchaseId !== p.id) {
        const old = findPurchaseById(sale.purchaseId);
        if (old) old.remainingQty += qty;
    }
    if (sale.lotId) {
        const oldLot = findLotById(sale.lotId);
        if (oldLot) oldLot.lot.remainingQty += qty;
    }

    // Link to this purchase
    sale.purchaseId = p.id;
    sale.lotId = null;
    sale.autoCogs = true;

    // ⭐ Correct COGS + PROFIT calculation
    sale.cogs = p.costPerItem * qty;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    // Reduce remaining qty
    p.remainingQty -= qty;

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    updateSummary();
}

/* -----------------------------
   RECURRING EXPENSES — ADD
----------------------------- */
function addRecurring() {
    const name = document.getElementById("rec-name").value.trim();
    const amount = Number(document.getElementById("rec-amount").value) || 0;
    const due = Number(document.getElementById("rec-due").value) || 0;
    const notes = document.getElementById("rec-notes").value.trim();

    if (!name || amount <= 0 || due <= 0) {
        alert("Enter Name, Amount, and Due Day.");
        return;
    }

    recurringExpenses.push({
        id: crypto.randomUUID(),
        name,
        amount,
        due,
        notes,
        paid: false   // ⭐ NEW FIELD
    });

    Storage.save("recurringExpenses", recurringExpenses);
    renderRecurringTable();
    updateSummary();

    document.getElementById("rec-name").value = "";
    document.getElementById("rec-amount").value = "";
    document.getElementById("rec-due").value = "";
    document.getElementById("rec-notes").value = "";
}

/* -----------------------------
   RECURRING EXPENSES — RENDER (PATCHED)
----------------------------- */
function renderRecurringTable() {
    const tbody = document.getElementById("recurring-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    recurringExpenses.forEach((r, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${r.name}</td>
            <td>$${r.amount.toFixed(2)}</td>
            <td>${r.due}</td>
            <td>${r.notes || ""}</td>
            <td>
                <input type="checkbox"
                       ${r.paid ? "checked" : ""}
                       onchange="toggleRecurringPaid(${index})">
                <button class="delete-btn" onclick="deleteRecurring(${index})">✖</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   RECURRING EXPENSES — TOGGLE PAID (NEW)
----------------------------- */
function toggleRecurringPaid(index) {
    const r = recurringExpenses[index];
    if (!r) return;

    r.paid = !r.paid;

    Storage.save("recurringExpenses", recurringExpenses);
    renderRecurringTable();
    updateSummary();
}

/* -----------------------------
   RECURRING EXPENSES — DELETE
----------------------------- */
function deleteRecurring(index) {
    recurringExpenses.splice(index, 1);
    Storage.save("recurringExpenses", recurringExpenses);
    renderRecurringTable();
    updateSummary();
}

/* -----------------------------
   PARENT PURCHASE — ADD
----------------------------- */
function addParentPurchase() {
    const sourceName = document.getElementById("pp-source").value.trim();
    const date = document.getElementById("pp-date").value;
    const premiumPercent = Number(document.getElementById("pp-premium-percent").value) || 0;
    const premiumAmount = Number(document.getElementById("pp-premium-amount").value) || 0;

    if (!sourceName || !date) {
        alert("Enter Source Name and Date.");
        return;
    }

    const parent = {
        id: crypto.randomUUID(),
        sourceName,
        date,
        buyerPremiumPercent: premiumPercent,
        buyerPremiumAmount: premiumAmount,
        totalHammer: 0,
        totalPremium: premiumAmount,
        totalCost: premiumAmount,
        totalQty: 0,
        costPerItem: 0,
        counted: false,
        subPurchases: []
    };

    parentPurchases.push(parent);
    Storage.save("parentPurchases", parentPurchases);

    renderParentPurchaseTable();

    document.getElementById("pp-source").value = "";
    document.getElementById("pp-date").value = "";
    document.getElementById("pp-premium-percent").value = "";
    document.getElementById("pp-premium-amount").value = "";
}

/* -----------------------------
   SELECT PARENT PURCHASE
----------------------------- */
let activeParentIndex = null;

function selectParentPurchase(index) {
    activeParentIndex = index;
    const parent = parentPurchases[index];

    document.getElementById("lot-parent-name").textContent = parent.sourceName;
    document.getElementById("lot-section").style.display = "block";

    renderLotTable();
}

/* -----------------------------
   LOTS — ADD LOT
----------------------------- */
function addLot() {
    if (activeParentIndex === null) return;

    const parent = parentPurchases[activeParentIndex];

    const lotNumber = document.getElementById("lot-number").value.trim();
    const hammerPrice = Number(document.getElementById("lot-hammer").value) || 0;
    const qty = Number(document.getElementById("lot-qty").value) || 0;

    if (!lotNumber || hammerPrice <= 0 || qty <= 0) {
        alert("Enter Lot Number, Hammer Price, and Qty.");
        return;
    }

    const lot = {
        id: crypto.randomUUID(),
        parentId: parent.id,
        lotNumber,
        hammerPrice,
        qty,
        premiumShare: 0,
        totalCost: 0,
        costPerItem: 0,
        remainingQty: qty,

        // ⭐ INITIAL TEMP VALUES — corrected after recalc
        totalProfit: -(hammerPrice),
        remainingCost: hammerPrice
    };

    parent.subPurchases.push(lot);

    recalcParentTotals(parent);

    // ⭐ FINAL CORRECTED PROFIT MATH — uses totalCost, not hammerPrice
    lot.totalProfit = -lot.totalCost;
    lot.remainingCost = lot.totalCost;

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();
    renderLotTable();

    document.getElementById("lot-number").value = "";
    document.getElementById("lot-hammer").value = "";
    document.getElementById("lot-qty").value = "";
}
/* -----------------------------
   RECALC PARENT TOTALS
----------------------------- */
function recalcParentTotals(parent) {
    parent.totalHammer = parent.subPurchases.reduce((sum, l) => sum + l.hammerPrice, 0);

    if (parent.buyerPremiumPercent > 0) {
        parent.totalPremium = parent.totalHammer * (parent.buyerPremiumPercent / 100);
        parent.buyerPremiumAmount = parent.totalPremium;
    } else if (parent.buyerPremiumAmount > 0) {
        parent.totalPremium = parent.buyerPremiumAmount;
        parent.buyerPremiumPercent =
            parent.totalHammer > 0
                ? (parent.buyerPremiumAmount / parent.totalHammer) * 100
                : 0;
    } else {
        parent.totalPremium = 0;
    }

    parent.subPurchases.forEach(lot => {
        if (parent.totalHammer > 0) {
            lot.premiumShare = (lot.hammerPrice / parent.totalHammer) * parent.totalPremium;
        } else {
            lot.premiumShare = 0;
        }

        lot.totalCost = lot.hammerPrice + lot.premiumShare;
        lot.costPerItem = lot.qty > 0 ? lot.totalCost / lot.qty : 0;

        // ⭐ ensure profit fields stay synced
        if (typeof lot.totalProfit !== "number") lot.totalProfit = -lot.totalCost;
        if (typeof lot.remainingCost !== "number") lot.remainingCost = lot.totalCost;
    });

    parent.totalQty = parent.subPurchases.reduce((sum, l) => sum + l.qty, 0);
    parent.totalCost = parent.totalHammer + parent.totalPremium;
    parent.costPerItem = parent.totalQty > 0 ? parent.totalCost / parent.totalQty : 0;
}

/* -----------------------------
   LOT TABLE — WITH PROFIT COLUMNS
----------------------------- */
function renderLotTable() {
    const tbody = document.getElementById("lot-table-body");
    if (!tbody || activeParentIndex === null) return;

    const parent = parentPurchases[activeParentIndex];
    tbody.innerHTML = "";

    parent.subPurchases.forEach((lot, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${lot.lotNumber}</td>
            <td>$${lot.hammerPrice.toFixed(2)}</td>
            <td>${lot.qty}</td>
            <td>$${lot.premiumShare.toFixed(2)}</td>
            <td>$${lot.totalCost.toFixed(2)}</td>
            <td>$${lot.costPerItem.toFixed(2)}</td>
            <td>${lot.remainingQty}</td>

            <!-- ⭐ NEW PROFIT COLUMNS -->
            <td>$${lot.totalProfit.toFixed(2)}</td>
            <td>$${lot.remainingCost.toFixed(2)}</td>

            <td><button class="delete-btn" onclick="deleteLot(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

function deleteLot(index) {
    if (activeParentIndex === null) return;

    const parent = parentPurchases[activeParentIndex];
    parent.subPurchases.splice(index, 1);

    recalcParentTotals(parent);

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();
    renderLotTable();
}

/* -----------------------------
   DELETE PARENT PURCHASE
----------------------------- */
function deleteParentPurchase(index) {
    parentPurchases.splice(index, 1);

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();

    document.getElementById("lot-section").style.display = "none";
}

/* -----------------------------
   RENDER PARENT PURCHASE TABLE
----------------------------- */
function renderParentPurchaseTable() {
    const tbody = document.getElementById("parent-purchase-table-body");
    tbody.innerHTML = "";

    parentPurchases.forEach((p, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${p.sourceName}</td>
            <td>${p.date}</td>
            <td>$${p.totalHammer.toFixed(2)}</td>
            <td>$${p.totalPremium.toFixed(2)}</td>
            <td>$${p.totalCost.toFixed(2)}</td>
            <td>${p.totalQty}</td>
            <td>
                <button class="action-btn" onclick="selectParentPurchase(${index})">
                    View Lots
                </button>
            </td>
            <td>
                <button class="delete-btn" onclick="deleteParentPurchase(${index})">✖</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SUMMARY CALCULATIONS
----------------------------- */
function updateSummary() {
    const totalSales = sales.reduce((s, x) => s + x.total, 0);
    const totalCogs = sales.reduce((s, x) => s + x.cogs, 0);
    const salesProfit = totalSales - totalCogs;

    const totalPurchases = purchases.filter(p => !p.counted).reduce((s, p) => s + p.amount, 0)
        + parentPurchases.filter(p => !p.counted).reduce((s, p) => s + p.totalCost, 0);

    // ⭐ You chose OPTION A — count ALL recurring bills
    const totalRecurring = recurringExpenses.reduce((s, r) => s + r.amount, 0);

    const salaryPaid = salaryEntries.reduce((s, e) => s + e.amount, 0);

    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    document.getElementById("sumTotalSales").textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById("sumTotalCOGS").textContent = `$${totalCogs.toFixed(2)}`;
    document.getElementById("sumSalesProfit").textContent = `$${salesProfit.toFixed(2)}`;
    document.getElementById("sumTotalPurchases").textContent = `$${totalPurchases.toFixed(2)}`;
    document.getElementById("sumTotalRecurring").textContent = `$${totalRecurring.toFixed(2)}`;
    document.getElementById("sumSalaryPaid").textContent = `$${salaryPaid.toFixed(2)}`;
    document.getElementById("sumNetProfit").textContent = `$${netProfit.toFixed(2)}`;

    const sourcingAmount = netProfit * (splitSourcing / 100);
    const savingsAmount  = netProfit * (splitSavings / 100);

    document.getElementById("sum75").textContent = `$${sourcingAmount.toFixed(2)}`;
    document.getElementById("sum25").textContent = `$${savingsAmount.toFixed(2)}`;

    const platEl = document.getElementById("sumByPlatform");
    if (platEl) {
        const byPlat = {};
        sales.forEach(s => {
            const k = s.platform || "Unspecified";
            if (!byPlat[k]) byPlat[k] = { count: 0, total: 0 };
            byPlat[k].count += 1;
            byPlat[k].total += s.total || 0;
        });
        const keys = Object.keys(byPlat).sort((a, b) => byPlat[b].total - byPlat[a].total);
        platEl.innerHTML = keys.length
            ? keys.map(k => `${k}: $${byPlat[k].total.toFixed(2)} (${byPlat[k].count} sale${byPlat[k].count === 1 ? "" : "s"})`).join("<br>")
            : "$0.00";
    }

    const sbEl = document.getElementById("sumStartingBalance");
    if (sbEl) {
        sbEl.textContent = `$${startingBalance.toFixed(2)}`;
    }

    updateSalaryTracker();
}

/* -----------------------------
   DOWNLOAD MONTHLY CSV (B2SS2B)
----------------------------- */
function downloadMonthlyCSV(summary) {
    const headers = [
        "Total Sales",
        "Total COGS",
        "Total Profit",
        "Total Purchases",
        "Total Recurring",
        "Salary Paid",
        "Net Profit",
        "Sourcing Split Amount",
        "Savings Split Amount",
        "Sourcing Split Percent",
        "Savings Split Percent",
        "Finalized Timestamp"
    ];

    const values = [
        summary.totalSales.toFixed(2),
        summary.totalCogs.toFixed(2),
        summary.totalProfit.toFixed(2),
        summary.totalPurchases.toFixed(2),
        summary.totalRecurring.toFixed(2),
        summary.salaryPaid.toFixed(2),
        summary.netProfit.toFixed(2),
        summary.sourcingAmount.toFixed(2),
        summary.savingsAmount.toFixed(2),
        summary.splitSourcingPercent.toFixed(2),
        summary.splitSavingsPercent.toFixed(2),
        summary.timestamp
    ];

    const csvContent = headers.join(",") + "\n" + values.join(",");

    const month = new Date().toISOString().slice(0, 7);
    const filename = `B2SS2B_${month}.csv`;

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();

    URL.revokeObjectURL(url);
}

/* -----------------------------
   TRIGGER CSV DOWNLOAD
----------------------------- */
function triggerCSVDownload() {
    const totalSales = sales.reduce((s, x) => s + x.total, 0);
    const totalCogs = sales.reduce((s, x) => s + x.cogs, 0);
    const salesProfit = totalSales - totalCogs;

    const totalPurchases = purchases.filter(p => !p.counted).reduce((s, p) => s + p.amount, 0)
        + parentPurchases.filter(p => !p.counted).reduce((s, p) => s + p.totalCost, 0);

    const totalRecurring = recurringExpenses.reduce((s, r) => s + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((s, e) => s + e.amount, 0);

    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    const sourcingAmount = netProfit * (splitSourcing / 100);
    const savingsAmount  = netProfit * (splitSavings / 100);

    const summary = {
        totalSales,
        totalCogs,
        totalProfit: salesProfit,
        totalPurchases,
        totalRecurring,
        salaryPaid,
        netProfit,
        sourcingAmount,
        savingsAmount,
        splitSourcingPercent: splitSourcing,
        splitSavingsPercent: splitSavings,
        timestamp: new Date().toISOString()
    };

    downloadMonthlyCSV(summary);
}


/* -----------------------------
   LINE-ITEM BACKUP CSV (all detail rows, incl. archives)
----------------------------- */
function csvCell(v) {
    if (v === null || typeof v === "undefined") v = "";
    v = String(v);
    return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
}

function downloadBackupCSV() {
    const rows = [["Type", "Month", "Date", "Item / Name", "Platform", "Qty", "Total", "Selling Cost", "COGS / Premium", "Profit", "Counted", "Notes"]];

    function saleRow(type, month, s) {
        rows.push([type, month, s.date || "", s.item || "", s.platform || "", s.qty || 0,
            (s.total || 0).toFixed(2), (s.sellingCost || 0).toFixed(2), (s.cogs || 0).toFixed(2),
            (s.profit || 0).toFixed(2), "", s.notes || ""]);
    }
    function purchaseRow(type, month, p) {
        rows.push([type, month, p.date || "", p.item || "", "", p.qty || 0,
            (p.amount || 0).toFixed(2), "", "", "", p.counted ? "yes" : "no", p.notes || ""]);
    }
    function parentRow(type, month, p) {
        rows.push([type, month, p.date || "", p.sourceName || "", "", p.totalQty || 0,
            (p.totalCost || 0).toFixed(2), "", (p.totalPremium || 0).toFixed(2), "",
            p.counted ? "yes" : "no", "Buyer premium %: " + (p.buyerPremiumPercent || 0)]);
        (p.subPurchases || []).forEach(l => {
            rows.push(["LOT", month, p.date || "", "Lot " + (l.lotNumber || "") + " (" + (p.sourceName || "") + ")", "",
                l.qty || 0, (l.totalCost || 0).toFixed(2), "", (l.premiumShare || 0).toFixed(2),
                (l.totalProfit || 0).toFixed(2), "", "Remaining qty: " + (l.remainingQty || 0)]);
        });
    }
    function recurringRow(type, month, r) {
        rows.push([type, month, "", r.name || "", "", "", (r.amount || 0).toFixed(2),
            "", "", "", "", "Due day: " + (r.dueDay || "") + " " + (r.notes || "")]);
    }
    function salaryRow(type, month, e) {
        rows.push([type, month, e.date || "", "Salary", "", "", (e.amount || 0).toFixed(2),
            "", "", "", "", e.notes || ""]);
    }

    sales.forEach(s => saleRow("SALE", "current", s));
    purchases.forEach(p => purchaseRow("PURCHASE", "current", p));
    parentPurchases.forEach(p => parentRow("PARENT_PURCHASE", "current", p));
    recurringExpenses.forEach(r => recurringRow("RECURRING", "current", r));
    salaryEntries.forEach(e => salaryRow("SALARY", "current", e));

    archiveMonths.forEach(a => {
        (a.sales || []).forEach(s => saleRow("ARCHIVE_SALE", a.name, s));
        (a.purchases || []).forEach(p => purchaseRow("ARCHIVE_PURCHASE", a.name, p));
        (a.parentPurchases || []).forEach(p => parentRow("ARCHIVE_PARENT_PURCHASE", a.name, p));
        (a.recurringExpenses || []).forEach(r => recurringRow("ARCHIVE_RECURRING", a.name, r));
        (a.salaryEntries || []).forEach(e => salaryRow("ARCHIVE_SALARY", a.name, e));
    });

    const csvContent = rows.map(r => r.map(csvCell).join(",")).join("\n");
    const filename = `B2SS2B_backup_${new Date().toISOString().slice(0, 10)}.csv`;
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

/* -----------------------------
   FINALIZE MONTH
----------------------------- */
function finalizeMonth() {
    const monthName = prompt("Enter a name for this month (e.g., June 2026):");
    if (!monthName) return;

    const totalSales = sales.reduce((s, x) => s + x.total, 0);
    const totalCogs = sales.reduce((s, x) => s + x.cogs, 0);
    const salesProfit = totalSales - totalCogs;

    const totalPurchases = purchases.filter(p => !p.counted).reduce((s, p) => s + p.amount, 0)
        + parentPurchases.filter(p => !p.counted).reduce((s, p) => s + p.totalCost, 0);

    const totalRecurring = recurringExpenses.reduce((s, r) => s + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((s, e) => s + e.amount, 0);

    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    const sourcingAmount = netProfit * (splitSourcing / 100);
    const savingsAmount  = netProfit * (splitSavings / 100);

    const archive = {
        name: monthName,
        sales,
        purchases,
        parentPurchases,
        recurringExpenses,
        salaryEntries,
        summary: {
            totalSales,
            totalCogs,
            totalPurchases,
            totalRecurring,
            salaryPaid,
            netProfit,
            sourcingSplit: sourcingAmount,
            savingsSplit: savingsAmount,
            splitSourcingPercent: splitSourcing,
            splitSavingsPercent: splitSavings
        }
    };

    archiveMonths.push(archive);
    Storage.save("archiveMonths", archiveMonths);

    // Mark this month's purchases as counted so they stay available for
    // inventory/COGS linking but are never counted in a later month.
    purchases.forEach(p => { p.counted = true; });
    parentPurchases.forEach(p => { p.counted = true; });
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);

    startingBalance = savingsAmount;
    Storage.save("startingBalance", startingBalance);

    const csvSummary = {
        totalSales,
        totalCogs,
        totalProfit: salesProfit,
        totalPurchases,
        totalRecurring,
        salaryPaid,
        netProfit,
        sourcingAmount,
        savingsAmount,
        splitSourcingPercent: splitSourcing,
        splitSavingsPercent: splitSavings,
        timestamp: new Date().toISOString()
    };
    downloadMonthlyCSV(csvSummary);

    sales = [];
    salaryEntries = [];

    Storage.save("sales", sales);
    Storage.save("salaryEntries", salaryEntries);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    renderArchive();
    renderRecurringTable();
    updateSummary();

    alert("Month finalized and archived!");
}

/* -----------------------------
   RENDER ARCHIVE LIST
----------------------------- */
function renderArchive() {
    const container = document.getElementById("archive-list");
    container.innerHTML = "";

    archiveMonths.forEach(a => {
        const div = document.createElement("div");
        div.className = "archive-entry";

        const s = a.summary || {};

        div.innerHTML = `
            <strong>${a.name}</strong><br>
            Total Sales: $${(s.totalSales || 0).toFixed(2)}<br>
            Total COGS: $${(s.totalCogs || 0).toFixed(2)}<br>
            Total Purchases: $${(s.totalPurchases || 0).toFixed(2)}<br>
            Recurring: $${(s.totalRecurring || 0).toFixed(2)}<br>
            Salary Paid: $${(s.salaryPaid || 0).toFixed(2)}<br>
            Net Profit: $${(s.netProfit || 0).toFixed(2)}<br>
            Sourcing (${s.splitSourcingPercent || splitSourcing}%): $${(s.sourcingSplit || 0).toFixed(2)}<br>
            Savings (${s.splitSavingsPercent || splitSavings}%): $${(s.savingsSplit || 0).toFixed(2)}
        `;

        container.appendChild(div);
    });
}

/* -----------------------------
   RESTORE PARENT PURCHASES FROM ARCHIVE
----------------------------- */
function restoreParentPurchasesFromArchive(monthName) {
    const archive = archiveMonths.find(a => a.name === monthName);
    if (!archive) {
        alert("Archive not found.");
        return;
    }

    parentPurchases = JSON.parse(JSON.stringify(archive.parentPurchases));
    Storage.save("parentPurchases", parentPurchases);

    purchases = JSON.parse(JSON.stringify(archive.purchases));
    Storage.save("purchases", purchases);

    renderParentPurchaseTable();
    renderLotTable();
    renderPurchaseTable();
    renderSalesTable();
    updateSummary();

    alert(`Restored purchases from ${monthName}. You can now link them.`);
}

/* -----------------------------
   INITIAL RENDER
----------------------------- */
normalizeData();
renderSalesTable();
renderSalaryTable();
loadSalaryGoal();
updateSalaryTracker();
renderPurchaseTable();
renderParentPurchaseTable();
renderLotTable();
renderArchive();
renderRecurringTable();
updateSummary();
