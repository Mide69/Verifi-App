import { backup, DatabaseSync } from 'node:sqlite'
import { closeSync, linkSync, lstatSync, mkdtempSync, openSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const tables = ['account','session','batch','pack','report','company_application','public_counter','audit']

function requireUnusedPath(path) {
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    if (lstatSync(path + suffix, {throwIfNoEntry:false})) {
      throw new Error('Choose a new destination without an existing database or SQLite sidecar.')
    }
  }
}

function prepareSnapshot(path) {
  const db = new DatabaseSync(path)
  try {
    if (tables.some(name => !db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(name))) {
      throw new Error('The source does not contain the Verifi workspace schema.')
    }
    if (db.prepare('PRAGMA integrity_check').all().some(row => row.integrity_check !== 'ok')
        || db.prepare('PRAGMA foreign_key_check').all().length) {
      throw new Error('The database failed integrity or foreign key validation.')
    }
    // The resulting file must travel alone and never carry active sign-in sessions.
    if (db.prepare('PRAGMA journal_mode=DELETE').get().journal_mode !== 'delete') {
      throw new Error('Could not prepare a standalone SQLite file.')
    }
    db.exec('PRAGMA secure_delete=ON; DELETE FROM session')
  } finally {
    db.close()
  }
}

async function copyWorkspace(sourcePath, destinationPath) {
  if (sourcePath === ':memory:' || destinationPath === ':memory:') {
    throw new Error('Choose file paths for the source and destination.')
  }
  const destination = resolve(destinationPath)
  requireUnusedPath(destination)
  const source = new DatabaseSync(resolve(sourcePath), {readOnly:true})
  let staging
  try {
    staging = mkdtempSync(join(dirname(destination), '.verifi-snapshot-'))
    const snapshot = join(staging, 'workspace.sqlite')
    closeSync(openSync(snapshot,'wx',0o600))
    source.exec('PRAGMA busy_timeout=5000')
    await backup(source,snapshot)
    prepareSnapshot(snapshot)
    requireUnusedPath(destination)
    linkSync(snapshot,destination)
  } finally {
    source.close()
    if (staging) rmSync(staging,{recursive:true,force:true})
  }
}

const args = process.argv.slice(2)
const [command, first, second] = args
if ((command !== 'backup' || args.length !== 2 || !first) &&
    (command !== 'restore' || args.length !== 3 || !first || !second)) {
  console.error('Usage: node workspace-backup.mjs backup <new-file> | restore <backup-file> <new-database>')
  process.exitCode = 1
} else {
  try {
    const source = command === 'backup' ? process.env.VERIFI_DB || './data/verifi.sqlite' : first
    await copyWorkspace(source, command === 'backup' ? first : second)
    console.log(command === 'backup' ? 'Workspace backup verified.' : 'Workspace database restored and verified.')
  } catch (error) {
    const message = /^ERR_SQLITE/.test(error.code || '') ? 'SQLite could not open, copy or validate the database.' : error.message
    console.error(message)
    process.exitCode = 1
  }
}
