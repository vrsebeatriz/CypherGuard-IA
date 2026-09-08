import fs from 'fs';
import path from 'path';
import { UnifiedAlert } from '../types';

export interface ScanHistoryEntry {
  id: string;
  timestamp: string;
  targetPath: string;
  totalAlerts: number;
  modelUsed: string;
  scaStatus: string;
}

const dataDir = path.join(__dirname, '../../data');
const historyFile = path.join(dataDir, 'history.json');

export class HistoryStorage {
  private ensureDataDir() {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(historyFile)) {
      fs.writeFileSync(historyFile, JSON.stringify([]), 'utf-8');
    }
  }

  public getHistory(): ScanHistoryEntry[] {
    this.ensureDataDir();
    try {
      const data = fs.readFileSync(historyFile, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      console.error('[HistoryStorage] Error reading history:', e);
      return [];
    }
  }

  public addEntry(entry: ScanHistoryEntry, fullResults: UnifiedAlert[]): void {
    const history = this.getHistory();
    history.unshift(entry);
    fs.writeFileSync(historyFile, JSON.stringify(history, null, 2), 'utf-8');
    
    // Save full results separately
    const resultsFile = path.join(dataDir, `scan-${entry.id}.json`);
    fs.writeFileSync(resultsFile, JSON.stringify(fullResults, null, 2), 'utf-8');
  }

  public getEntry(id: string): ScanHistoryEntry | undefined {
    return this.getHistory().find(e => e.id === id);
  }
  
  public getFullResults(id: string): UnifiedAlert[] | null {
    const resultsFile = path.join(dataDir, `scan-${id}.json`);
    if (fs.existsSync(resultsFile)) {
      try {
        return JSON.parse(fs.readFileSync(resultsFile, 'utf-8'));
      } catch (e) {
        return null;
      }
    }
    return null;
  }

  public deleteEntry(id: string): boolean {
    const history = this.getHistory();
    const filtered = history.filter(e => e.id !== id);
    if (filtered.length === history.length) return false;
    fs.writeFileSync(historyFile, JSON.stringify(filtered, null, 2), 'utf-8');

    const resultsFile = path.join(dataDir, `scan-${id}.json`);
    if (fs.existsSync(resultsFile)) {
      try {
        fs.unlinkSync(resultsFile);
      } catch (e) {
        // ignora se não conseguir deletar o arquivo secundário
      }
    }
    return true;
  }

  public getStats() {
    const history = this.getHistory();
    const totalScans = history.length;
    const totalAlerts = history.reduce((sum, h) => sum + (h.totalAlerts || 0), 0);
    const models = Array.from(new Set(history.map(h => h.modelUsed).filter(Boolean)));
    return {
      totalScans,
      totalAlerts,
      uniqueModels: models.length,
      lastScan: history[0]?.timestamp || null
    };
  }
}
