/* ============================================================
   RESELLER B2SS2B BREAKUP — CORE APP LOGIC (WITH PARENT PURCHASES + LOTS)
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

/* -----------------------------
   PARENT PURCHASE SYSTEM
----------------------------- */
let parentPurchases = Storage.load("parentPurchases", []);

/* -----------------------------
   DATA NORMALIZATION (BACKWARD COMPAT)
----------------------------- */
function normalizeData() {
    // Ensure purchases have id and remainingQty
    purchases = purchases.map(p => {
        if (!p.id) {
            p.id = crypto.randomUUID();
        }
        if (typeof p.remainingQty !== "number") {
            // If no remainingQty stored, assume full qty is remaining
            p.remainingQty = typeof p.qty === "number" ? p.qty : 0;
        }
        return p;
    });

    // Ensure sales have id, purchaseId, autoCogs
    sales = sales.map(s => {
        if (!s.id) {
            s.id = crypto.randomUUID();
        }
        if (typeof s.purchaseId === "undefined") {
            s.purchaseId = null;
        }
        if (typeof s.autoCogs === "undefined") {
            // If COGS was manually entered before, treat as manual (false)
            s.autoCogs = false;
        }
        return s;
    });

    // Normalize parent purchases
    parentPurchases = parentPurchases.map(p => {
        if (!p.id) p.id = crypto.randomUUID();
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
            return l;
        });

        return p;
    });

    Storage.save("purchases", purchases);
    Storage.save("sales", sales);
    Storage.save("parentPurchases", parentPurchases);
}

/* -----------------------------
   HELPER — FIND PURCHASE BY ID
----------------------------- */
function findPurchaseById(id) {
    return purchases.find(p => p.id === id) || null;
}

/* -----------------------------
   HELPER — FIND LOT BY ID
----------------------------- */
function findLotById(lotId) {
    for (const parent of parentPurchases) {
        const lot = parent.subPurchases.find(l => l.id === lotId);
        if (lot) return { parent, lot };
    }
    return null;
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

    if (!item || qty <= 0 || total <= 0) {
        alert("Please enter at least Item, Qty, and Total Sale Price.");
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
        purchaseId: null,
        lotId: null,
        autoCogs: cogs === 0 // if user didn't enter COGS, treat as auto later
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
}

/* -----------------------------
   SALES — INLINE COGS UPDATE
----------------------------- */
function updateCogsInline(index, newValue) {
    const s = sales[index];
    const newCogs = Number(newValue);

    if (isNaN(newCogs)) return;

    s.cogs = newCogs;
    s.profit = s.total - s.sellingCost - s.cogs;
    s.autoCogs = false; // user manually overrode COGS

    Storage.save("sales", sales);
    renderSalesTable();
    updateSummary();
}

/* -----------------------------
   SALES — LINK SIMPLE PURCHASE TO SALE
----------------------------- */
function linkPurchaseToSale(saleIndex, purchaseId) {
    const sale = sales[saleIndex];
    const purchase = findPurchaseById(purchaseId);

    if (!sale || !purchase) return;

    const qty = sale.qty || 0;

    if (purchase.remainingQty < qty) {
        alert("Not enough remaining quantity in that purchase to cover this sale.");
        return;
    }

    // If sale was previously linked to a simple purchase, restore old purchase remainingQty first
    if (sale.purchaseId) {
        const oldPurchase = findPurchaseById(sale.purchaseId);
        if (oldPurchase) {
            oldPurchase.remainingQty += qty;
        }
    }

    // If sale was previously linked to a lot, restore that lot remainingQty
    if (sale.lotId) {
        const found = findLotById(sale.lotId);
        if (found) {
            found.lot.remainingQty += qty;
        }
    }

    // Link to new simple purchase
    sale.purchaseId = purchase.id;
    sale.lotId = null;
    sale.autoCogs = true;

    // Auto COGS = costPerItem * qty
    sale.cogs = purchase.costPerItem * qty;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    // Deplete inventory
    purchase.remainingQty -= qty;

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
   SALES — LINK LOT TO SALE
----------------------------- */
function linkLotToSale(saleIndex, lotId) {
    const sale = sales[saleIndex];
    const found = findLotById(lotId);

    if (!sale || !found) return;

    const { parent, lot } = found;
    const qty = sale.qty || 0;

    if (lot.remainingQty < qty) {
        alert("Not enough remaining quantity in that lot to cover this sale.");
        return;
    }

    // If sale was previously linked to a simple purchase, restore old purchase remainingQty first
    if (sale.purchaseId) {
        const oldPurchase = findPurchaseById(sale.purchaseId);
        if (oldPurchase) {
            oldPurchase.remainingQty += qty;
        }
    }

    // If sale was previously linked to a different lot, restore that lot remainingQty
    if (sale.lotId) {
        const oldFound = findLotById(sale.lotId);
        if (oldFound) {
            oldFound.lot.remainingQty += qty;
        }
    }

    // Link to new lot
    sale.purchaseId = null;
    sale.lotId = lot.id;
    sale.autoCogs = true;

    // Auto COGS = lot.costPerItem * qty
    sale.cogs = lot.costPerItem * qty;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

    // Deplete inventory
    lot.remainingQty -= qty;

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
   SALES — UNLINK FROM ANY PURCHASE/LOT
----------------------------- */
function unlinkPurchaseFromSale(saleIndex) {
    const sale = sales[saleIndex];
    if (!sale) return;

    const qty = sale.qty || 0;

    // Restore simple purchase qty if linked
    if (sale.purchaseId) {
        const purchase = findPurchaseById(sale.purchaseId);
        if (purchase) {
            purchase.remainingQty += qty;
        }
    }

    // Restore lot qty if linked
    if (sale.lotId) {
        const found = findLotById(sale.lotId);
        if (found) {
            found.lot.remainingQty += qty;
        }
    }

    sale.purchaseId = null;
    sale.lotId = null;
    sale.autoCogs = false;
    sale.cogs = 0;
    sale.profit = sale.total - sale.sellingCost - sale.cogs;

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
   SALES — DELETE ENTRY
----------------------------- */
function deleteSale(index) {
    const s = sales[index];
    const qty = s ? (s.qty || 0) : 0;

    // If linked to a simple purchase, restore remainingQty
    if (s && s.purchaseId) {
        const purchase = findPurchaseById(s.purchaseId);
        if (purchase) {
            purchase.remainingQty += qty;
        }
    }

    // If linked to a lot, restore remainingQty
    if (s && s.lotId) {
        const found = findLotById(s.lotId);
        if (found) {
            found.lot.remainingQty += qty;
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

    // Build SIMPLE purchase options
    const simpleOptions = purchases
        .filter(p => p.remainingQty > 0)
        .map(p => ({
            type: "simple",
            id: p.id,
            label: `${p.item} — ${p.remainingQty} left — $${p.costPerItem.toFixed(2)} ea`
        }));

    // Build LOT options (grouped under parents)
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

        // Determine linked label
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
                    ? `<button class="delete-btn" style="margin-left:4px;" onclick="unlinkPurchaseFromSale(${index})">Unlink</button>`
                    : ""
                }
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
   SALES — HANDLE DROPDOWN CHANGE
----------------------------- */
function handlePurchaseSelectChange(saleIndex, value) {
    if (!value) {
        unlinkPurchaseFromSale(saleIndex);
        return;
    }

    if (value.startsWith("simple-")) {
        const id = value.replace("simple-", "");
        linkPurchaseToSale(saleIndex, id);
        return;
    }

    if (value.startsWith("lot-")) {
        const id = value.replace("lot-", "");
        linkLotToSale(saleIndex, id);
        return;
    }
}

/* -----------------------------
   CSV IMPORTER
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
            if (!r || r.length < 9) continue;

            const item = (r[0] || "").trim();
            if (!item) continue;

            const qty = toNumber(r[2]);
            const totalSale = toNumber(r[3]);
            const sellingCost = toNumber(r[8]);
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
                purchaseId: null,
                lotId: null,
                autoCogs: true
            });
        }

        Storage.save("sales", sales);
        renderSalesTable();
        updateSummary();
        alert("CSV Imported Successfully!");
    };

    reader.readAsText(file);
}

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
   SIMPLE PURCHASES — ADD ENTRY
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
        notes
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

/* -----------------------------
   SIMPLE PURCHASES — RENDER TABLE
----------------------------- */
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
            <td>${typeof p.remainingQty === "number" ? p.remainingQty : p.qty}</td>
            <td>${p.date}</td>
            <td>${p.notes || ""}</td>
            <td><button class="delete-btn" onclick="deletePurchase(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SIMPLE PURCHASES — DELETE ENTRY
----------------------------- */
function deletePurchase(index) {
    purchases.splice(index, 1);
    Storage.save("purchases", purchases);
    renderPurchaseTable();
    updateSummary();
}
/* -----------------------------
   PARENT PURCHASES — RENDER TABLE
----------------------------- */
function renderParentPurchaseTable() {
    const tbody = document.getElementById("parent-purchase-table-body");
    if (!tbody) return;

    tbody.innerHTML = "";

    parentPurchases.forEach((p, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${p.sourceName}</td>
            <td>${p.date || ""}</td>
            <td>$${p.totalHammer.toFixed(2)}</td>
            <td>$${p.totalPremium.toFixed(2)}</td>
            <td>$${p.totalCost.toFixed(2)}</td>
            <td>${p.totalQty}</td>
            <td>${p.subPurchases.length}</td>
            <td>
                <button onclick="selectParentPurchase(${index})">Open</button>
                <button class="delete-btn" onclick="deleteParentPurchase(${index})">✖</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}
function addParentPurchase() {
    const sourceName = document.getElementById("parent-source-name").value.trim();
    const date = document.getElementById("parent-date").value;

    if (!sourceName || !date) {
        alert("Enter Source Name and Date.");
        return;
    }

    const parent = {
        id: crypto.randomUUID(),
        sourceName,
        date,
        buyerPremiumPercent: 0,
        buyerPremiumAmount: 0,
        totalHammer: 0,
        totalPremium: 0,
        totalCost: 0,
        totalQty: 0,
        costPerItem: 0,
        subPurchases: []
    };

    parentPurchases.push(parent);
    Storage.save("parentPurchases", parentPurchases);

    renderParentPurchaseTable();

    // Clear inputs
    document.getElementById("parent-source-name").value = "";
    document.getElementById("parent-date").value = "";
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
        remainingQty: qty
    };

    parent.subPurchases.push(lot);

    recalcParentTotals(parent);

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();
    renderLotTable();

    document.getElementById("lot-number").value = "";
    document.getElementById("lot-hammer").value = "";
    document.getElementById("lot-qty").value = "";
}

/* -----------------------------
   LOTS — RECALCULATE PARENT TOTALS
----------------------------- */
function recalcParentTotals(parent) {
    // 1. Total hammer
    parent.totalHammer = parent.subPurchases.reduce((sum, l) => sum + l.hammerPrice, 0);

    // 2. Premium: percent OR amount
    if (parent.buyerPremiumPercent > 0) {
        parent.totalPremium = parent.totalHammer * (parent.buyerPremiumPercent / 100);
        parent.buyerPremiumAmount = parent.totalPremium;
    } else if (parent.buyerPremiumAmount > 0) {
        parent.totalPremium = parent.buyerPremiumAmount;
        parent.buyerPremiumPercent = parent.totalHammer > 0
            ? (parent.buyerPremiumAmount / parent.totalHammer) * 100
            : 0;
    } else {
        parent.totalPremium = 0;
    }

    // 3. Distribute premium proportionally
    parent.subPurchases.forEach(lot => {
        if (parent.totalHammer > 0) {
            lot.premiumShare = (lot.hammerPrice / parent.totalHammer) * parent.totalPremium;
        } else {
            lot.premiumShare = 0;
        }

        lot.totalCost = lot.hammerPrice + lot.premiumShare;
        lot.costPerItem = lot.qty > 0 ? lot.totalCost / lot.qty : 0;
    });

    // 4. Total qty
    parent.totalQty = parent.subPurchases.reduce((sum, l) => sum + l.qty, 0);

    // 5. Total cost
    parent.totalCost = parent.totalHammer + parent.totalPremium;

    // 6. Parent-level cost per item (optional)
    parent.costPerItem = parent.totalQty > 0 ? parent.totalCost / parent.totalQty : 0;
}

/* -----------------------------
   LOTS — RENDER TABLE
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
            <td><button class="delete-btn" onclick="deleteLot(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   LOTS — DELETE LOT
----------------------------- */
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
   PARENT PURCHASE — DELETE
----------------------------- */
function deleteParentPurchase(index) {
    parentPurchases.splice(index, 1);

    Storage.save("parentPurchases", parentPurchases);
    renderParentPurchaseTable();

    document.getElementById("lot-section").style.display = "none";
}

/* -----------------------------
   RECURRING — ADD ENTRY
----------------------------- */
function addRecurring() {
    const name = document.getElementById("rec-name").value.trim();
    const amount = Number(document.getElementById("rec-amount").value) || 0;
    const dueDay = Number(document.getElementById("rec-due").value) || 0;
    const notes = document.getElementById("rec-notes").value.trim();

    if (!name || amount <= 0 || dueDay < 1 || dueDay > 31) {
        alert("Please enter Name, Amount, and a valid Due Day (1–31).");
        return;
    }

    recurringExpenses.push({
        name,
        amount,
        dueDay,
        notes
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
   RECURRING — DELETE ENTRY
----------------------------- */
function deleteRecurring(index) {
    recurringExpenses.splice(index, 1);
    Storage.save("recurringExpenses", recurringExpenses);
    renderRecurringTable();
    updateSummary();
}

/* -----------------------------
   RECURRING — RENDER TABLE
----------------------------- */
function renderRecurringTable() {
    const tbody = document.getElementById("recurring-table-body");
    tbody.innerHTML = "";

    recurringExpenses.forEach((r, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${r.name}</td>
            <td>$${r.amount.toFixed(2)}</td>
            <td>${r.dueDay}</td>
            <td>${r.notes || ""}</td>
            <td><button class="delete-btn" onclick="deleteRecurring(${index})">✖</button></td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SALARY — UPDATE GOAL
----------------------------- */
function updateSalaryGoal() {
    const input = document.getElementById("salary-goal-input");
    const val = Number(input.value) || 0;
    salaryGoal = val;
    Storage.save("salaryGoal", salaryGoal);
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — ADD ENTRY
----------------------------- */
function addSalaryEntry() {
    const amount = Number(document.getElementById("salary-amount").value) || 0;
    const date = document.getElementById("salary-date").value.trim();

    if (amount <= 0) {
        alert("Enter a valid salary amount.");
        return;
    }

    salaryEntries.push({ amount, date });
    Storage.save("salaryEntries", salaryEntries);

    renderSalaryTable();
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
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — PAY FULL REMAINING
----------------------------- */
function payFullSalary() {
    const paid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const remaining = salaryGoal - paid;

    if (remaining <= 0) return;

    salaryEntries.push({
        amount: remaining,
        date: new Date().toISOString().split("T")[0]
    });

    Storage.save("salaryEntries", salaryEntries);
    renderSalaryTable();
    updateSalaryTracker();
}

/* -----------------------------
   SALARY — RENDER TABLE
----------------------------- */
function renderSalaryTable() {
    const tbody = document.getElementById("salary-table-body");
    tbody.innerHTML = "";

    salaryEntries.forEach((e, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td>${e.date || ""}</td>
            <td>$${e.amount.toFixed(2)}</td>
            <td>
                <button class="delete-btn" onclick="deleteSalaryEntry(${index})">✖</button>
            </td>
        `;

        tbody.appendChild(row);
    });
}

/* -----------------------------
   SALARY — TRACKER UI
----------------------------- */
function updateSalaryTracker() {
    const paid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const remaining = Math.max(salaryGoal - paid, 0);

    document.querySelector("#salary p:nth-of-type(1)").innerHTML =
        `<strong>Paid:</strong> $${paid.toFixed(2)}`;
    document.querySelector("#salary p:nth-of-type(2)").innerHTML =
        `<strong>Remaining:</strong> $${remaining.toFixed(2)}`;

    const fill = document.querySelector(".progress-fill");
    const percent = salaryGoal > 0 ? (paid / salaryGoal) * 100 : 0;
    fill.style.width = `${Math.min(percent, 100)}%`;

    updateSummary();
}

/* -----------------------------
   SUMMARY — CALCULATE TOTALS
----------------------------- */
function updateSummary() {
    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalCOGS = sales.reduce((sum, s) => sum + s.cogs, 0);
    const salesProfit = sales.reduce((sum, s) => sum + s.profit, 0);

    const totalPurchases = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalRecurring = recurringExpenses.reduce((sum, r) => sum + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);

    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    document.getElementById("sumTotalSales").textContent = `$${totalSales.toFixed(2)}`;
    document.getElementById("sumTotalCOGS").textContent = `$${totalCOGS.toFixed(2)}`;
    document.getElementById("sumSalesProfit").textContent = `$${salesProfit.toFixed(2)}`;
    document.getElementById("sumTotalPurchases").textContent = `$${totalPurchases.toFixed(2)}`;
    document.getElementById("sumTotalRecurring").textContent = `$${totalRecurring.toFixed(2)}`;
    document.getElementById("sumSalaryPaid").textContent = `$${salaryPaid.toFixed(2)}`;

    const netEl = document.getElementById("sumNetProfit");
    netEl.textContent = `$${netProfit.toFixed(2)}`;
    netEl.style.color = netProfit >= 0 ? "#4CAF50" : "#D9534F";

    document.getElementById("sum75").textContent = `$${(netProfit * 0.75).toFixed(2)}`;
    document.getElementById("sum25").textContent = `$${(netProfit * 0.25).toFixed(2)}`;
}

/* -----------------------------
   FINALIZE MONTH (ARCHIVE)
----------------------------- */
function finalizeMonth() {
    if (!confirm("Are you sure you want to finalize this month? This will reset Sales, Purchases, and Salary data.")) return;

    const totalSales = sales.reduce((sum, s) => sum + s.total, 0);
    const totalCOGS = sales.reduce((sum, s) => sum + s.cogs, 0);
    const salesProfit = sales.reduce((sum, s) => sum + s.profit, 0);
    const totalPurchases = purchases.reduce((sum, p) => sum + p.amount, 0);
    const totalRecurring = recurringExpenses.reduce((sum, r) => sum + r.amount, 0);
    const salaryPaid = salaryEntries.reduce((sum, e) => sum + e.amount, 0);
    const netProfit = salesProfit - totalPurchases - totalRecurring - salaryPaid;

    const seventyFive = netProfit * 0.75;
    const twentyFive = netProfit * 0.25;

    archiveMonths.push({
        date: new Date().toLocaleDateString(),
        totals: {
            totalSales,
            totalCOGS,
            salesProfit,
            totalPurchases,
            totalRecurring,
            salaryPaid,
            netProfit,
            seventyFive,
            twentyFive
        }
    });

    Storage.save("archiveMonths", archiveMonths);

    // Reset monthly data but keep recurring expenses
    sales = [];
    purchases = [];
    parentPurchases = [];
    salaryEntries = [];

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);
    Storage.save("salaryEntries", salaryEntries);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    renderSalaryTable();
    updateSalaryTracker();
    updateSummary();
    renderArchive();

    alert("Month finalized and archived.");
}

/* -----------------------------
   ARCHIVE — RENDER
----------------------------- */
function renderArchive() {
    const container = document.getElementById("archive-list");
    if (!container) return;

    if (!archiveMonths || archiveMonths.length === 0) {
        container.innerHTML = "<p>No months archived yet.</p>";
        return;
    }

    container.innerHTML = archiveMonths.map(m => `
        <div class="archive-month">
            <h4>${m.date}</h4>
            <p><strong>Sales:</strong> $${m.totals.totalSales.toFixed(2)}</p>
            <p><strong>Net Profit:</strong> $${m.totals.netProfit.toFixed(2)}</p>
            <p><strong>75% Sourcing:</strong> $${m.totals.seventyFive.toFixed(2)}</p>
            <p><strong>25% Savings:</strong> $${m.totals.twentyFive.toFixed(2)}</p>
        </div>
    `).join("");
}

/* -----------------------------
   RESET MONTH (manual)
----------------------------- */
function resetMonth() {
    if (!confirm("Reset all monthly data?")) return;

    sales = [];
    purchases = [];
    parentPurchases = [];
    salaryEntries = [];

    Storage.save("sales", sales);
    Storage.save("purchases", purchases);
    Storage.save("parentPurchases", parentPurchases);
    Storage.save("salaryEntries", salaryEntries);

    renderSalesTable();
    renderPurchaseTable();
    renderParentPurchaseTable();
    renderLotTable();
    renderRecurringTable();
    renderSalaryTable();
    updateSalaryTracker();
    updateSummary();
}

/* -----------------------------
   INITIAL LOAD
----------------------------- */
normalizeData();
renderSalesTable();
renderPurchaseTable();
renderParentPurchaseTable();
renderRecurringTable();
renderSalaryTable();
updateSalaryTracker();
updateSummary();
renderArchive();
window.addParentPurchase = addParentPurchase;
