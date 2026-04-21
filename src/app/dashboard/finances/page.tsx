import { redirect } from 'next/navigation';

export default function FinancesRedirectPage() {
  redirect('/dashboard/finance/admin');
}
