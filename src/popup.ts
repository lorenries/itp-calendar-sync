import { SyncResult } from './types';

interface PopupElements {
  syncButton: HTMLButtonElement;
  status: HTMLDivElement;
  eventsFound: HTMLElement;
  eventsSynced: HTMLElement;
}

class PopupController {
  private elements: PopupElements;
  
  constructor() {
    this.elements = {
      syncButton: document.getElementById('syncButton') as HTMLButtonElement,
      status: document.getElementById('status') as HTMLDivElement,
      eventsFound: document.getElementById('eventsFound') as HTMLElement,
      eventsSynced: document.getElementById('eventsSynced') as HTMLElement
    };
    
    this.init();
  }
  
  init() {
    this.elements.syncButton.addEventListener('click', () => this.handleSync());
    this.loadSyncStatus();
  }
  
  async loadSyncStatus() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_SYNC_STATUS' });
      this.elements.eventsSynced.textContent = response.syncedEventsCount.toString();
    } catch (error) {
      console.error('Failed to load sync status:', error);
    }
  }
  
  showStatus(message: string, type: 'success' | 'error' | 'info') {
    this.elements.status.textContent = message;
    this.elements.status.className = `status ${type}`;
    this.elements.status.style.display = 'block';
  }
  
  hideStatus() {
    this.elements.status.style.display = 'none';
  }
  
  setLoading(loading: boolean) {
    if (loading) {
      this.elements.syncButton.disabled = true;
      this.elements.syncButton.innerHTML = '<span class="loading"></span>Syncing...';
    } else {
      this.elements.syncButton.disabled = false;
      this.elements.syncButton.innerHTML = 'Sync Events';
    }
  }
  
  async getEventsFromActiveTab(): Promise<any[]> {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    
    if (!tab.id) {
      throw new Error('No active tab found');
    }
    
    if (!tab.url?.includes('itp.nyu.edu/camp/2025/dashboard')) {
      throw new Error('Please navigate to the ITP Camp dashboard first');
    }
    
    try {
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_EVENTS' });
      return response.events || [];
    } catch (error) {
      // If content script isn't loaded, try to inject it
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      });
      
      // Wait a moment then try again
      await new Promise(resolve => setTimeout(resolve, 500));
      const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_EVENTS' });
      return response.events || [];
    }
  }
  
  async handleSync() {
    this.hideStatus();
    this.setLoading(true);
    
    try {
      const events = await this.getEventsFromActiveTab();
      
      if (events.length === 0) {
        this.showStatus('No RSVPed events found on this page', 'info');
        this.elements.eventsFound.textContent = '0';
        return;
      }
      
      this.elements.eventsFound.textContent = events.length.toString();
      
      const result: SyncResult = await chrome.runtime.sendMessage({
        type: 'SYNC_EVENTS',
        events: events
      });
      
      if (result.success) {
        if (result.eventsCreated === 0) {
          this.showStatus('All events are already synced!', 'info');
        } else {
          this.showStatus(
            `Successfully synced ${result.eventsCreated} new event${result.eventsCreated === 1 ? '' : 's'}!`,
            'success'
          );
        }
      } else {
        const errorMessage = result.errors.length > 0 
          ? result.errors[0] 
          : 'Sync failed with unknown error';
        this.showStatus(`Sync failed: ${errorMessage}`, 'error');
      }
      
      await this.loadSyncStatus();
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      this.showStatus(`Error: ${errorMessage}`, 'error');
    } finally {
      this.setLoading(false);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});