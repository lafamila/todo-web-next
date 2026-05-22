import CalendarGrid from './_components/CalendarGrid';

export const metadata = {
  title: 'Daily Tracker - Calendar',
  description: 'Daily task completion calendar',
};

export default function CalendarPage() {
  return (
    <div className="min-h-screen bg-black">
      <CalendarGrid />
    </div>
  );
}
