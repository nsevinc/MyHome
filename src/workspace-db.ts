let connection: Promise<IDBDatabase> | undefined

export function idbResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function finished(tx: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('Yerel kayıt işlemi tamamlanamadı.'))
  })
}

async function migrateCatalog(db: IDBDatabase) {
  if (await idbResult(db.transaction('projects').objectStore('projects').get('catalog-v1'))) return
  const request = indexedDB.open('myhome-model-library', 1)
  request.onupgradeneeded = () => request.result.createObjectStore('models', { keyPath: 'id' })
  const legacy = await idbResult(request)
  try {
    const entries = await idbResult(legacy.transaction('models').objectStore('models').getAll())
    const tx = db.transaction(['projects', 'models'], 'readwrite')
    const marker = tx.objectStore('projects')
    const models = tx.objectStore('models')
    const completion = finished(tx)
    const migrated = marker.get('catalog-v1')
    migrated.onsuccess = () => {
      if (migrated.result) return
      for (const entry of entries) models.put(entry)
      marker.put(true, 'catalog-v1')
    }
    await completion
  } finally { legacy.close() }
}

export function workspaceDatabase() {
  if (!connection) {
    const request = indexedDB.open('myhome', 4)
    request.onblocked = () => {
      // Existing tabs release their connection when refreshed or closed.
      window.dispatchEvent(new Event('myhome-storage-blocked'))
    }
    request.onupgradeneeded = event => {
      const db = request.result
      if (event.oldVersion === 0) db.createObjectStore('projects')
      if (event.oldVersion < 2) {
        db.createObjectStore('archive', { keyPath: 'id' })
        db.createObjectStore('revisions', { keyPath: 'id' }).createIndex('projectId', 'projectId')
        db.createObjectStore('models', { keyPath: 'id' })
      }
      if (event.oldVersion < 3) {
        db.createObjectStore('render-outputs', { keyPath: 'id' })
        db.createObjectStore('render-png')
      }
      request.transaction!.objectStore('render-outputs').createIndex('snapshotId', 'snapshotId')
      db.createObjectStore('render-snapshots')
    }
    connection = idbResult(request).then(async db => {
      db.onversionchange = () => { db.close(); connection = undefined }
      try { await migrateCatalog(db); return db }
      catch (error) { db.close(); throw error }
    }).catch(error => { connection = undefined; throw error })
  }
  return connection
}

export async function writeWorkspace(stores: string[], writer: (tx: IDBTransaction) => void) {
  const db = await workspaceDatabase()
  const tx = db.transaction(stores, 'readwrite')
  const completion = finished(tx)
  try { writer(tx) } catch (error) { tx.abort(); await completion.catch(() => {}); throw error }
  await completion
}
