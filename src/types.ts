export interface ITPEvent {
  title: string;
  date: string;
  time: string;
  leaders: string;
  tags: string[];
  url?: string;
}

export interface CalendarEvent {
  summary: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  description: string;
  source?: {
    title: string;
    url: string;
  };
}

export interface SyncResult {
  success: boolean;
  eventsFound: number;
  eventsCreated: number;
  errors: string[];
}

export interface StoredEvent {
  itpEventId: string;
  calendarEventId: string;
  lastSynced: string;
}