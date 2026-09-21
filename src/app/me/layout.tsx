import type { ReactNode } from 'react';

import '../pass-scope.css';

export const metadata = {
  title: 'Student Pass · GBPUAT Smart Identity',
  description: 'Your university identity, what it is valid for, and what it has done on campus.',
};

/**
 * The student pass.
 *
 * No AppShell: this is a phone document, not a desk tool, and it carries its
 * own frame. The stylesheet is imported here rather than in the root layout
 * because nothing outside /me uses it.
 */
export default function StudentLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
