/*
   Block Inventory Management System - Database Operations (Compat Mode)
   Non-modular structure to allow double-clicking index.html locally without CORS errors.
   Exposes core database functions, including reverse stock math for deletes/edits.
*/

// --- REAL-TIME IN-MEMORY QUERY CACHE ---
let cachedBlockTypes = [];
let cachedTransactions = [];
let unsubscribeBlocksListener = null;
let unsubscribeTransactionsListener = null;

// --- SEED DATA FOR DEMO MODE (LocalStorage Sandbox) ---
const INITIAL_BLOCK_TYPES = [
  { id: "b1", name: "Boşluklu Bims 10", dimensions: { length: 40, width: 10, height: 20 }, initial_stock: 100, current_stock: 99, under_repair_stock: 0, min_threshold: 10, max_threshold: 80, blocks_per_pallet: 150, created_at: Date.now() - 100000000 },
  { id: "b2", name: "Boşluklu Bims 15", dimensions: { length: 40, width: 15, height: 20 }, initial_stock: 200, current_stock: 190, under_repair_stock: 0, min_threshold: 15, max_threshold: 150, blocks_per_pallet: 120, created_at: Date.now() - 90000000 },
  { id: "b3", name: "Boşluklu Bims 20", dimensions: { length: 40, width: 20, height: 20 }, initial_stock: 300, current_stock: 325, under_repair_stock: 0, min_threshold: 20, max_threshold: 200, blocks_per_pallet: 90, created_at: Date.now() - 80000000 },
  { id: "b4", name: "Dolu Blok 15", dimensions: { length: 40, width: 15, height: 20 }, initial_stock: 100, current_stock: 100, under_repair_stock: 0, min_threshold: 10, max_threshold: 80, blocks_per_pallet: 120, created_at: Date.now() - 70000000 },
  { id: "b5", name: "Asmolen Bims 20", dimensions: { length: 40, width: 20, height: 20 }, initial_stock: 180, current_stock: 180, under_repair_stock: 0, min_threshold: 12, max_threshold: 120, blocks_per_pallet: 100, created_at: Date.now() - 60000000 }
];

const INITIAL_TRANSACTIONS = [
  { id: "t1", block_type_id: "b3", block_name: "Boşluklu Bims 20", type: "production", quantity: 25, created_by: "İmdat Şef (Üretim Sorumlusu)", date: Date.now() - 86400000 * 2, notes: "Sabah Vardiyası Üretimi - Saha A" },
  { id: "t2", block_type_id: "b2", block_name: "Boşluklu Bims 15", type: "dispatch", quantity: 10, created_by: "Samet Şef (Sevkiyat Sorumlusu)", date: Date.now() - 86400000 * 1.5, notes: "Fiş No 2041 - Müteahhit Ali Bey" },
  { id: "t3", block_type_id: "b1", block_name: "Boşluklu Bims 10", type: "to_repair", quantity: 1, created_by: "İmdat Şef (Üretim Sorumlusu)", date: Date.now() - 86400000 * 1, notes: "Sahada taşıma esnasında oluşan kırıklar" },
  { id: "t4", block_type_id: "b1", block_name: "Boşluklu Bims 10", type: "repaired", quantity: 1, created_by: "Samet Şef (Sevkiyat Sorumlusu)", date: Date.now() - 86400000 * 0.5, notes: "Onarımı tamamlanıp stoğa iade edildi" },
  { id: "t5", block_type_id: "b1", block_name: "Boşluklu Bims 10", type: "waste", quantity: 1, created_by: "Samet Şef (Sevkiyat Sorumlusu)", date: Date.now() - 86400000 * 0.2, notes: "Kullanılamaz yükleme kırığı (tamamen fire)" }
];

// Helper to initialize local storage databases
const initLocalStorageDB = () => {
  const currentVersion = "v4";
  const existingVersion = localStorage.getItem("blocks_db_version");
  
  if (existingVersion !== currentVersion) {
    localStorage.setItem("blocks_db", JSON.stringify(INITIAL_BLOCK_TYPES));
    localStorage.setItem("transactions_db", JSON.stringify(INITIAL_TRANSACTIONS));
    localStorage.setItem("blocks_db_version", currentVersion);
  }
};

// Execute initialization in demo mode
if (window.isDemoMode) {
  initLocalStorageDB();
}

// ==========================================
// DB OPERATIONS IMPLEMENTATION
// ==========================================

// A wrapper to enforce a timeout on any promise (e.g. Firestore get request)
const promiseWithTimeout = (promise, ms, timeoutErrorMsg) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(timeoutErrorMsg));
    }, ms);
  });
  return Promise.race([promise, timeoutPromise]).then((result) => {
    clearTimeout(timeoutId);
    return result;
  });
};

// Helper to update the last database modification timestamp
const updateLastDbUpdateTimestamp = async () => {
  const now = Date.now();
  if (window.isDemoMode) {
    localStorage.setItem("last_db_update", now.toString());
  } else {
    try {
      await window.db.collection("metadata").doc("status").set({ last_update: now }, { merge: true });
      localStorage.setItem("last_db_update", now.toString());
    } catch (e) {
      console.warn("⚠️ Failed to update last db update timestamp:", e.message);
    }
  }
};

// Helper to get the last database modification timestamp
const getLastUpdateTimestamp = async () => {
  if (window.isDemoMode) {
    const val = localStorage.getItem("last_db_update");
    return val ? Number(val) : null;
  } else {
    try {
      const getPromise = window.db.collection("metadata").doc("status").get();
      const doc = await promiseWithTimeout(
        getPromise,
        2500,
        "Veri güncelleme zamanı okuma süresi doldu."
      );
      if (doc.exists) {
        const data = doc.data();
        if (data && data.last_update) {
          localStorage.setItem("last_db_update", data.last_update.toString()); // Sync local cache
          return data.last_update;
        }
      }
    } catch (e) {
      console.warn("⚠️ Failed to get last db update timestamp from cloud:", e.message);
    }
    // Fallback to local cache if offline/failed
    const val = localStorage.getItem("last_db_update");
    return val ? Number(val) : null;
  }
};

const getBlockTypes = async (useCache = true) => {
  if (window.isDemoMode) {
    return JSON.parse(localStorage.getItem("blocks_db")) || [];
  } else {
    if (useCache && cachedBlockTypes.length > 0) {
      return cachedBlockTypes;
    }
    try {
      const getPromise = window.db.collection("block_types").orderBy("created_at", "asc").get();
      const snapshot = await promiseWithTimeout(
        getPromise,
        3500,
        "Google Firebase sunucularına bağlantı zaman aşımına uğradı (Lütfen Firestore sekmesinde 'Create Database' butonuna tıkladığınızdan ve kuralları Test Modu olarak aktif ettiğinizden emin olun)."
      );
      
      cachedBlockTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      let blocks = cachedBlockTypes;
      
      if (blocks.length > 0) {
        localStorage.setItem("cloud_db_seeded", "true");
      }
      
      // Auto-seed empty cloud Firestore for immediate live demo (only once)!
      if (blocks.length === 0 && !localStorage.getItem("cloud_db_seeded")) {
        console.log("🌱 Cloud database is empty! Seeding default block types to Firestore...");
        for (const b of INITIAL_BLOCK_TYPES) {
          const { id, ...data } = b;
          const docRef = await window.db.collection("block_types").add(data);
          blocks.push({ id: docRef.id, ...data });
        }
        
        console.log("🌱 Seeding default transactions to Firestore...");
        for (const t of INITIAL_TRANSACTIONS) {
          const { id, ...data } = t;
          const oldBlock = INITIAL_BLOCK_TYPES.find(x => x.id === t.block_type_id);
          const newBlock = blocks.find(x => x.name === oldBlock.name);
          if (newBlock) {
            data.block_type_id = newBlock.id;
            await window.db.collection("transactions").add(data);
          }
        }
        localStorage.setItem("cloud_db_seeded", "true");
      }
      
      return blocks;
    } catch (error) {
      console.warn("⚠️ Firebase Firestore error, falling back to local storage:", error.message);
      
      // Temporary fallback so UI doesn't hang
      window.isDemoMode = true;
      
      let alertMsg = "Bulut bağlantısı başarısız oldu ve geçici olarak yerel demo moduna geçildi. ";
      const errLower = error.message.toLowerCase();
      if (errLower.includes("permission") || errLower.includes("insufficient")) {
        alertMsg += "Nedeni: Firestore güvenlik kuralları erişimi engelliyor. Lütfen Firestore'daki 'Rules' sekmesine gidin ve kuralları Test Modu olarak şu şekilde güncelleyin: allow read, write: if true;";
      } else if (errLower.includes("not enabled") || errLower.includes("could not reach") || errLower.includes("failed-precondition") || errLower.includes("time out") || errLower.includes("zaman aşımı")) {
        alertMsg += "Nedeni: Projeniz için henüz Firestore veritabanı oluşturulmamış veya bulut aktif değil. Lütfen Firebase Konsolunu açın, 'Firestore Database' butonuna ve ardından 'Create Database' seçeneğine tıklayın.";
      } else {
        alertMsg += "Nedeni: " + error.message;
      }
      
      throw new Error(alertMsg);
    }
  }
};

const createBlockType = async (name, length, width, height, initialStock, minThreshold, maxThreshold, blocksPerPallet) => {
  const newBlock = {
    name,
    dimensions: { length: Number(length), width: Number(width), height: Number(height) },
    initial_stock: Number(initialStock),
    current_stock: Number(initialStock),
    under_repair_stock: 0,
    min_threshold: Number(minThreshold || 10),
    max_threshold: Number(maxThreshold || 100),
    blocks_per_pallet: Number(blocksPerPallet || 120),
    created_at: Date.now()
  };

  if (window.isDemoMode) {
    const blocks = JSON.parse(localStorage.getItem("blocks_db")) || [];
    const blockWithId = { id: "b_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9), ...newBlock };
    blocks.push(blockWithId);
    localStorage.setItem("blocks_db", JSON.stringify(blocks));
    await updateLastDbUpdateTimestamp();
    return blockWithId;
  } else {
    const docRef = await window.db.collection("block_types").add(newBlock);
    await updateLastDbUpdateTimestamp();
    return { id: docRef.id, ...newBlock };
  }
};

const deleteBlockType = async (id) => {
  if (window.isDemoMode) {
    let blocks = JSON.parse(localStorage.getItem("blocks_db")) || [];
    blocks = blocks.filter(b => b.id !== id);
    localStorage.setItem("blocks_db", JSON.stringify(blocks));
    await updateLastDbUpdateTimestamp();
    return true;
  } else {
    await window.db.collection("block_types").doc(id).delete();
    await updateLastDbUpdateTimestamp();
    return true;
  }
};

const updateBlockType = async (id, name, length, width, height, minThreshold, maxThreshold, blocksPerPallet, initialStock, currentStock = null) => {
  minThreshold = Number(minThreshold || 10);
  maxThreshold = Number(maxThreshold || 100);
  blocksPerPallet = Number(blocksPerPallet || 120);
  initialStock = Number(initialStock || 0);

  if (window.isDemoMode) {
    const blocks = JSON.parse(localStorage.getItem("blocks_db")) || [];
    const blockIndex = blocks.findIndex(b => b.id === id);
    if (blockIndex === -1) throw new Error("نوع البلوك غير موجود!");
    
    blocks[blockIndex].name = name;
    blocks[blockIndex].dimensions = { length: Number(length), width: Number(width), height: Number(height) };
    blocks[blockIndex].min_threshold = minThreshold;
    blocks[blockIndex].max_threshold = maxThreshold;
    blocks[blockIndex].blocks_per_pallet = blocksPerPallet;
    blocks[blockIndex].initial_stock = initialStock;
    
    if (currentStock !== null) {
      blocks[blockIndex].current_stock = Number(currentStock);
    } else {
      const oldInitial = blocks[blockIndex].initial_stock || 0;
      const diff = initialStock - oldInitial;
      blocks[blockIndex].current_stock = (blocks[blockIndex].current_stock || 0) + diff;
    }
    
    localStorage.setItem("blocks_db", JSON.stringify(blocks));
    await updateLastDbUpdateTimestamp();
    return blocks[blockIndex];
  } else {
    const blockRef = window.db.collection("block_types").doc(id);
    const blockDoc = await blockRef.get();
    if (!blockDoc.exists) throw new Error("نوع البلوك غير موجود!");
    
    const blockData = blockDoc.data();
    const oldInitial = blockData.initial_stock || 0;
    const diff = initialStock - oldInitial;
    const updatedCurrent = (blockData.current_stock || 0) + diff;

    const updatedData = {
      name,
      dimensions: { length: Number(length), width: Number(width), height: Number(height) },
      min_threshold: minThreshold,
      max_threshold: maxThreshold,
      blocks_per_pallet: blocksPerPallet,
      initial_stock: initialStock,
      current_stock: currentStock !== null ? Number(currentStock) : updatedCurrent
    };
    await blockRef.update(updatedData);
    await updateLastDbUpdateTimestamp();
    return { id, ...updatedData };
  }
};

// Add a transaction
const addTransaction = async (blockTypeId, type, quantity, notes, userName) => {
  quantity = Number(quantity);
  let blockName = "";

  if (window.isDemoMode) {
    const blocks = JSON.parse(localStorage.getItem("blocks_db")) || [];
    const blockIndex = blocks.findIndex(b => b.id === blockTypeId);

    if (blockIndex === -1) throw new Error("نوع البلوك غير موجود!");
    const block = blocks[blockIndex];
    blockName = block.name;

    // Apply Stock Mathematics
    if (type === "production") {
      block.current_stock += quantity;
    } else if (type === "dispatch") {
      if (block.current_stock < quantity) {
        throw new Error(`المخزون الحالي لا يكفي! المتاح: ${block.current_stock} بلوكة.`);
      }
      block.current_stock -= quantity;
    } else if (type === "waste") {
      if (block.current_stock < quantity) {
        throw new Error(`المخزون الحالي لا يكفي لخصم الهدر! المتاح: ${block.current_stock} - المطلوب: ${quantity}.`);
      }
      block.current_stock -= quantity;
    } else if (type === "to_repair") {
      if (block.current_stock < quantity) {
        throw new Error(`المخزون الحالي لا يكفي للكسر المراد إصلاحه! المتاح: ${block.current_stock} - المطلوب: ${quantity}.`);
      }
      block.current_stock -= quantity;
      block.under_repair_stock += quantity;
    } else if (type === "repaired") {
      if (block.under_repair_stock < quantity) {
        throw new Error(`كمية البلوك تحت الإصلاح لا تكفي! المتاح للصيانة: ${block.under_repair_stock} - المطلوب: ${quantity}.`);
      }
      block.under_repair_stock -= quantity;
      block.current_stock += quantity;
    } else {
      throw new Error("نوع العملية غير صالح!");
    }

    // Save transaction
    const transactions = JSON.parse(localStorage.getItem("transactions_db")) || [];
    const newTx = {
      id: "t_" + Date.now() + "_" + Math.random().toString(36).substring(2, 9),
      block_type_id: blockTypeId,
      block_name: blockName,
      type,
      quantity,
      created_by: userName,
      date: Date.now(),
      notes
    };
    transactions.unshift(newTx);

    localStorage.setItem("blocks_db", JSON.stringify(blocks));
    localStorage.setItem("transactions_db", JSON.stringify(transactions));
    await updateLastDbUpdateTimestamp();
    return newTx;

  } else {
    // CLOUD MODE
    const blocks = await getBlockTypes();
    const block = blocks.find(b => b.id === blockTypeId);
    if (!block) throw new Error("نوع البلوك غير موجود!");
    blockName = block.name;

    let updatedCurrentStock = block.current_stock;
    let updatedUnderRepairStock = block.under_repair_stock;

    if (type === "production") {
      updatedCurrentStock += quantity;
    } else if (type === "dispatch") {
      if (block.current_stock < quantity) throw new Error(`المخزون الحالي لا يكفي! المتاح: ${block.current_stock} بلوكة.`);
      updatedCurrentStock -= quantity;
    } else if (type === "waste") {
      if (block.current_stock < quantity) throw new Error(`المخزون الحالي لا يكفي! المتاح: ${block.current_stock} بلوكة.`);
      updatedCurrentStock -= quantity;
    } else if (type === "to_repair") {
      if (block.current_stock < quantity) throw new Error(`المخزون الحالي لا يكفي! المتاح: ${block.current_stock} بلوكة.`);
      updatedCurrentStock -= quantity;
      updatedUnderRepairStock += quantity;
    } else if (type === "repaired") {
      if (block.under_repair_stock < quantity) throw new Error(`كمية البلوك تحت الإصلاح لا تكفي! المتاح للصيانة: ${block.under_repair_stock} بلوكة.`);
      updatedUnderRepairStock -= quantity;
      updatedCurrentStock += quantity;
    }

    const newTx = {
      block_type_id: blockTypeId,
      block_name: blockName,
      type,
      quantity,
      created_by: userName,
      date: Date.now(),
      notes
    };

    await window.db.collection("block_types").doc(blockTypeId).update({
      current_stock: updatedCurrentStock,
      under_repair_stock: updatedUnderRepairStock
    });
    
    const txRef = await window.db.collection("transactions").add(newTx);
    await updateLastDbUpdateTimestamp();
    return { id: txRef.id, ...newTx };
  }
};

// ==========================================
// 3. EDIT & DELETE (REVERSE MATH) ENGINE
// ==========================================

// Delete transaction and apply reverse math to stock
const deleteTransaction = async (txId) => {
  if (window.isDemoMode) {
    const transactions = JSON.parse(localStorage.getItem("transactions_db")) || [];
    const blocks = JSON.parse(localStorage.getItem("blocks_db")) || [];

    const txIndex = transactions.findIndex(t => t.id === txId);
    if (txIndex === -1) throw new Error("الحركة غير موجودة!");
    const tx = transactions[txIndex];

    const blockIndex = blocks.findIndex(b => b.id === tx.block_type_id);
    if (blockIndex !== -1) {
      const block = blocks[blockIndex];
      const qty = tx.quantity;

      // Apply Reverse Mathematics based on original transaction type
      if (tx.type === "production") {
        block.current_stock -= qty; // Reverse: subtract production
      } else if (tx.type === "dispatch" || tx.type === "waste") {
        block.current_stock += qty; // Reverse: return sales load / waste back to stock
      } else if (tx.type === "to_repair") {
        block.current_stock += qty; // Reverse: return to stock
        block.under_repair_stock -= qty; // and deduct from repair
      } else if (tx.type === "repaired") {
        block.under_repair_stock += qty; // Reverse: return to repair
        block.current_stock -= qty; // and deduct from selling stock
      }
    }

    // Delete transaction from array
    transactions.splice(txIndex, 1);

    // Save databases
    localStorage.setItem("blocks_db", JSON.stringify(blocks));
    localStorage.setItem("transactions_db", JSON.stringify(transactions));
    await updateLastDbUpdateTimestamp();
    return true;

  } else {
    // CLOUD MODE: Retrieve transaction doc, reverse stock, delete doc
    const txRef = window.db.collection("transactions").doc(txId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new Error("الحركة غير موجودة في السحابة!");
    const tx = txDoc.data();

    const blockRef = window.db.collection("block_types").doc(tx.block_type_id);
    const blockDoc = await blockRef.get();
    
    if (blockDoc.exists) {
      const block = blockDoc.data();
      const qty = tx.quantity;
      let updatedCurrent = block.current_stock;
      let updatedRepair = block.under_repair_stock;

      if (tx.type === "production") {
        updatedCurrent -= qty;
      } else if (tx.type === "dispatch" || tx.type === "waste") {
        updatedCurrent += qty;
      } else if (tx.type === "to_repair") {
        updatedCurrent += qty;
        updatedRepair -= qty;
      } else if (tx.type === "repaired") {
        updatedRepair += qty;
        updatedCurrent -= qty;
      }

      await blockRef.update({
        current_stock: updatedCurrent,
        under_repair_stock: updatedRepair
      });
    }

    await txRef.delete();
    await updateLastDbUpdateTimestamp();
    return true;
  }
};

// Edit transaction: reverse old and apply new stock mathematics
const editTransaction = async (txId, newBlockTypeId, newQuantity, newNotes) => {
  newQuantity = Number(newQuantity);

  if (window.isDemoMode) {
    const transactions = JSON.parse(localStorage.getItem("transactions_db")) || [];
    const blocks = JSON.parse(localStorage.getItem("blocks_db")) || [];

    const txIndex = transactions.findIndex(t => t.id === txId);
    if (txIndex === -1) throw new Error("الحركة غير موجودة!");
    const tx = transactions[txIndex];

    const oldBlockIndex = blocks.findIndex(b => b.id === tx.block_type_id);
    const newBlockIndex = blocks.findIndex(b => b.id === newBlockTypeId);
    if (newBlockIndex === -1) throw new Error("نوع البلوك الجديد غير موجود!");

    // 1. REVERSE OLD STOCK IMPACT
    if (oldBlockIndex !== -1) {
      const oldBlock = blocks[oldBlockIndex];
      const oldQty = tx.quantity;

      if (tx.type === "production") {
        oldBlock.current_stock -= oldQty;
      } else if (tx.type === "dispatch" || tx.type === "waste") {
        oldBlock.current_stock += oldQty;
      } else if (tx.type === "to_repair") {
        oldBlock.current_stock += oldQty;
        oldBlock.under_repair_stock -= oldQty;
      } else if (tx.type === "repaired") {
        oldBlock.under_repair_stock += oldQty;
        oldBlock.current_stock -= oldQty;
      }
    }

    // 2. CHECK AND APPLY NEW STOCK IMPACT
    const newBlock = blocks[newBlockIndex];
    if (tx.type === "production") {
      newBlock.current_stock += newQuantity;
    } else if (tx.type === "dispatch") {
      if (newBlock.current_stock < newQuantity) throw new Error(`المخزون الجديد لا يكفي لتلبية التحميل! المتاح: ${newBlock.current_stock}`);
      newBlock.current_stock -= newQuantity;
    } else if (tx.type === "waste") {
      if (newBlock.current_stock < newQuantity) throw new Error(`المخزون الجديد لا يكفي لخصم الهدر! المتاح: ${newBlock.current_stock}`);
      newBlock.current_stock -= newQuantity;
    } else if (tx.type === "to_repair") {
      if (newBlock.current_stock < newQuantity) throw new Error(`المخزون الجديد لا يكفي لكسر الإصلاح! المتاح: ${newBlock.current_stock}`);
      newBlock.current_stock -= newQuantity;
      newBlock.under_repair_stock += newQuantity;
    } else if (tx.type === "repaired") {
      if (newBlock.under_repair_stock < newQuantity) throw new Error(`كمية البلوك تحت الإصلاح المتوفرة لا تكفي! المتاح للصيانة: ${newBlock.under_repair_stock}`);
      newBlock.under_repair_stock -= newQuantity;
      newBlock.current_stock += newQuantity;
    }

    // 3. UPDATE TRANSACTION DATA
    tx.block_type_id = newBlockTypeId;
    tx.block_name = newBlock.name;
    tx.quantity = newQuantity;
    tx.notes = newNotes;

    // Save Databases
    localStorage.setItem("blocks_db", JSON.stringify(blocks));
    localStorage.setItem("transactions_db", JSON.stringify(transactions));
    await updateLastDbUpdateTimestamp();
    return tx;

  } else {
    // CLOUD MODE
    const txRef = window.db.collection("transactions").doc(txId);
    const txDoc = await txRef.get();
    if (!txDoc.exists) throw new Error("الحركة غير موجودة!");
    const tx = txDoc.data();

    // 1. REVERSE OLD STOCK IMPACT
    const oldBlockRef = window.db.collection("block_types").doc(tx.block_type_id);
    const oldBlockDoc = await oldBlockRef.get();
    if (oldBlockDoc.exists) {
      const oldBlock = oldBlockDoc.data();
      const oldQty = tx.quantity;
      let updatedCurrent = oldBlock.current_stock;
      let updatedRepair = oldBlock.under_repair_stock;

      if (tx.type === "production") {
        updatedCurrent -= oldQty;
      } else if (tx.type === "dispatch" || tx.type === "waste") {
        updatedCurrent += oldQty;
      } else if (tx.type === "to_repair") {
        updatedCurrent += oldQty;
        updatedRepair -= oldQty;
      } else if (tx.type === "repaired") {
        updatedRepair += oldQty;
        updatedCurrent -= oldQty;
      }

      await oldBlockRef.update({
        current_stock: updatedCurrent,
        under_repair_stock: updatedRepair
      });
    }

    // 2. CHECK AND APPLY NEW STOCK IMPACT
    const newBlockRef = window.db.collection("block_types").doc(newBlockTypeId);
    const newBlockDoc = await newBlockRef.get();
    if (!newBlockDoc.exists) throw new Error("نوع البلوك الجديد غير موجود!");
    
    const newBlock = newBlockDoc.data();
    let updatedCurrentNew = newBlock.current_stock;
    let updatedRepairNew = newBlock.under_repair_stock;

    if (tx.type === "production") {
      updatedCurrentNew += newQuantity;
    } else if (tx.type === "dispatch") {
      if (newBlock.current_stock < newQuantity) throw new Error(`المخزون لا يكفي! المتاح: ${newBlock.current_stock}`);
      updatedCurrentNew -= newQuantity;
    } else if (tx.type === "waste") {
      if (newBlock.current_stock < newQuantity) throw new Error(`المخزون لا يكفي! المتاح: ${newBlock.current_stock}`);
      updatedCurrentNew -= newQuantity;
    } else if (tx.type === "to_repair") {
      if (newBlock.current_stock < newQuantity) throw new Error(`المخزون لا يكفي! المتاح: ${newBlock.current_stock}`);
      updatedCurrentNew -= newQuantity;
      updatedRepairNew += newQuantity;
    } else if (tx.type === "repaired") {
      if (newBlock.under_repair_stock < newQuantity) throw new Error(`بلوك الصيانة لا يكفي! المتاح: ${newBlock.under_repair_stock}`);
      updatedRepairNew -= newQuantity;
      updatedCurrentNew += newQuantity;
    }

    await newBlockRef.update({
      current_stock: updatedCurrentNew,
      under_repair_stock: updatedRepairNew
    });

    // 3. UPDATE TRANSACTION DOCUMENT
    const updatedData = {
      block_type_id: newBlockTypeId,
      block_name: newBlock.name,
      quantity: newQuantity,
      notes: newNotes
    };

    await txRef.update(updatedData);
    await updateLastDbUpdateTimestamp();
    return { id: txId, ...tx, ...updatedData };
  }
};

const getTransactions = async (useCache = true) => {
  if (window.isDemoMode) {
    return JSON.parse(localStorage.getItem("transactions_db")) || [];
  } else {
    if (useCache && cachedTransactions.length > 0) {
      return cachedTransactions;
    }
    const snapshot = await window.db.collection("transactions").orderBy("date", "desc").get();
    cachedTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    return cachedTransactions;
  }
};

const getStats = async (targetMonth = null, targetYear = null) => {
  const blocks = await getBlockTypes();
  const txs = await getTransactions();

  const totalStock = blocks.reduce((acc, b) => acc + b.current_stock, 0);
  const totalUnderRepair = blocks.reduce((acc, b) => acc + b.under_repair_stock, 0);

  let startTimestamp, endTimestamp;
  if (targetMonth !== null && targetYear !== null) {
    startTimestamp = new Date(targetYear, targetMonth, 1).getTime();
    endTimestamp = new Date(targetYear, targetMonth + 1, 1).getTime();
  } else {
    const now = new Date();
    startTimestamp = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    endTimestamp = now.getTime() + 86400000;
  }

  let monthProduction = 0;
  let monthDispatch = 0;

  txs.forEach(t => {
    if (t.date >= startTimestamp && t.date < endTimestamp) {
      if (t.type === "production") {
        monthProduction += t.quantity;
      } else if (t.type === "dispatch") {
        monthDispatch += t.quantity;
      }
    }
  });

  return {
    totalStock,
    totalUnderRepair,
    monthProduction,
    monthDispatch
  };
};

const getAnalyticsData = async (targetMonth = null, targetYear = null) => {
  const txs = await getTransactions();
  const blocks = await getBlockTypes();

  // 1. Stock Distribution
  const distributionLabels = blocks.map(b => b.name);
  const distributionData = blocks.map(b => b.current_stock);

  // 2. Comparison (7 days by default, or entire month if specified)
  const dataLabels = [];
  const productionData = [];
  const dispatchData = [];

  if (targetMonth !== null && targetYear !== null) {
    const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
    const daysArray = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(targetYear, targetMonth, day);
      daysArray.push({
        dateStr: `${day}/${targetMonth + 1}`,
        timestampStart: d.getTime(),
        timestampEnd: d.getTime() + 86400000,
        prod: 0,
        disp: 0
      });
    }

    txs.forEach(t => {
      daysArray.forEach(day => {
        if (t.date >= day.timestampStart && t.date < day.timestampEnd) {
          if (t.type === "production") day.prod += t.quantity;
          else if (t.type === "dispatch") day.disp += t.quantity;
        }
      });
    });

    daysArray.forEach(day => {
      dataLabels.push(day.dateStr);
      productionData.push(day.prod);
      dispatchData.push(day.disp);
    });
  } else {
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      last7Days.push({
        dateStr: `${d.getDate()}/${d.getMonth() + 1}`,
        timestampStart: d.getTime(),
        timestampEnd: d.getTime() + 86400000,
        prod: 0,
        disp: 0
      });
    }

    txs.forEach(t => {
      last7Days.forEach(day => {
        if (t.date >= day.timestampStart && t.date < day.timestampEnd) {
          if (t.type === "production") day.prod += t.quantity;
          else if (t.type === "dispatch") day.disp += t.quantity;
        }
      });
    });

    last7Days.forEach(day => {
      dataLabels.push(day.dateStr);
      productionData.push(day.prod);
      dispatchData.push(day.disp);
    });
  }

  return {
    distribution: {
      labels: distributionLabels,
      datasets: [{
        label: "Palet Miktarı",
        data: distributionData,
        backgroundColor: [
          "rgba(249, 115, 22, 0.65)",  /* Orange */
          "rgba(59, 130, 246, 0.65)",  /* Blue */
          "rgba(34, 197, 94, 0.65)",   /* Green */
          "rgba(234, 179, 8, 0.65)",   /* Gold/Yellow */
          "rgba(168, 85, 247, 0.65)",  /* Purple */
          "rgba(6, 182, 212, 0.65)",   /* Teal/Cyan */
          "rgba(244, 63, 94, 0.65)",   /* Pink/Rose */
          "rgba(16, 185, 129, 0.65)",  /* Emerald */
          "rgba(99, 102, 241, 0.65)",  /* Indigo */
          "rgba(139, 92, 246, 0.65)",  /* Violet */
          "rgba(217, 70, 239, 0.65)",  /* Fuchsia */
          "rgba(14, 165, 233, 0.65)",  /* Sky Blue */
          "rgba(239, 68, 68, 0.65)",   /* Crimson Red */
          "rgba(132, 204, 22, 0.65)",  /* Lime */
          "rgba(245, 158, 11, 0.65)",  /* Amber */
          "rgba(20, 184, 166, 0.65)",  /* Turquoise */
          "rgba(148, 163, 184, 0.65)", /* Slate/Silver */
          "rgba(251, 146, 60, 0.65)",  /* Coral/Peach */
          "rgba(236, 72, 153, 0.65)",  /* Hot Pink */
          "rgba(21, 128, 61, 0.65)"    /* Forest Green */
        ],
        borderColor: [
          "hsl(20, 95%, 55%)",
          "hsl(210, 100%, 56%)",
          "hsl(142, 76%, 45%)",
          "hsl(45, 100%, 51%)",
          "hsl(270, 84%, 60%)",
          "hsl(188, 86%, 43%)",
          "hsl(348, 89%, 60%)",
          "hsl(159, 84%, 39%)",
          "hsl(239, 84%, 67%)",
          "hsl(259, 84%, 66%)",
          "hsl(292, 84%, 61%)",
          "hsl(199, 89%, 48%)",
          "hsl(0, 84%, 60%)",
          "hsl(84, 81%, 44%)",
          "hsl(38, 92%, 50%)",
          "hsl(172, 66%, 40%)",
          "hsl(215, 16%, 65%)",
          "hsl(27, 96%, 61%)",
          "hsl(329, 86%, 61%)",
          "hsl(142, 72%, 29%)"
        ],
        borderWidth: 1
      }]
    },
    weeklyComparison: {
      labels: dataLabels,
      production: productionData,
      dispatch: dispatchData
    }
  };
};

// --- DATA BACKUP & RESTORE OPERATIONS ---
const exportData = async () => {
  const blocks = await getBlockTypes();
  const txs = await getTransactions();
  return {
    blocks,
    transactions: txs,
    exported_at: Date.now(),
    app: "Ozel Bims Stok Takip"
  };
};

const importData = async (backup) => {
  if (!backup || !Array.isArray(backup.blocks) || !Array.isArray(backup.transactions)) {
    throw new Error("Geçersiz yedek dosyası formatı!");
  }

  if (window.isDemoMode) {
    localStorage.setItem("blocks_db", JSON.stringify(backup.blocks));
    localStorage.setItem("transactions_db", JSON.stringify(backup.transactions));
    await updateLastDbUpdateTimestamp();
    return true;
  } else {
    // Cloud Mode: Safe transactional upload to Firestore
    // 1. Delete all current blocks and transactions from Firestore
    const oldBlocks = await getBlockTypes();
    for (const b of oldBlocks) {
      await window.db.collection("block_types").doc(b.id).delete();
    }
    const oldTxs = await getTransactions();
    for (const t of oldTxs) {
      await window.db.collection("transactions").doc(t.id).delete();
    }
    
    // 2. Upload restored blocks to Firestore and map old IDs to new Firestore document IDs
    const idMap = {};
    for (const b of backup.blocks) {
      const { id, ...data } = b;
      const docRef = await window.db.collection("block_types").add(data);
      idMap[id] = docRef.id;
    }
    
    // 3. Upload restored transactions to Firestore with correctly mapped block IDs
    for (const t of backup.transactions) {
      const { id, ...data } = t;
      if (idMap[data.block_type_id]) {
        data.block_type_id = idMap[data.block_type_id];
      }
      await window.db.collection("transactions").add(data);
    }
    await updateLastDbUpdateTimestamp();
    return true;
  }
};

// --- REAL-TIME LISTENER SUBSCRIPTIONS ---
const subscribeToBlockTypes = (onUpdate, onError) => {
  if (window.isDemoMode) {
    // Demo Mode: call immediately with local storage values
    getBlockTypes().then(onUpdate).catch(onError);
    return () => {};
  }

  if (unsubscribeBlocksListener) unsubscribeBlocksListener();

  unsubscribeBlocksListener = window.db.collection("block_types").orderBy("created_at", "asc").onSnapshot(
    (snapshot) => {
      cachedBlockTypes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      onUpdate(cachedBlockTypes);
    },
    (error) => {
      if (onError) onError(error);
    }
  );

  return unsubscribeBlocksListener;
};

const subscribeToTransactions = (onUpdate, onError) => {
  if (window.isDemoMode) {
    getTransactions().then(onUpdate).catch(onError);
    return () => {};
  }

  if (unsubscribeTransactionsListener) unsubscribeTransactionsListener();

  unsubscribeTransactionsListener = window.db.collection("transactions").orderBy("date", "desc").onSnapshot(
    (snapshot) => {
      cachedTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      onUpdate(cachedTransactions);
    },
    (error) => {
      if (onError) onError(error);
    }
  );

  return unsubscribeTransactionsListener;
};

// Export to window object
window.dbOps = {
  getBlockTypes,
  createBlockType,
  deleteBlockType,
  addTransaction,
  getTransactions,
  getStats,
  getAnalyticsData,
  deleteTransaction,
  editTransaction,
  updateBlockType,
  getLastUpdateTimestamp,
  exportData,
  importData,
  subscribeToBlockTypes,
  subscribeToTransactions
};
