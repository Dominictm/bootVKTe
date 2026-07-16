import { Table } from "./tables";

export interface Booking {
  eventId: string;
  table: Table;
  start: Date;
  end: Date;
  name: string;
}
