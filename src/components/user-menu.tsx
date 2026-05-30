'use client';

import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { ChevronDown, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { withBase } from '@/lib/base-path';

interface Props {
  email: string;
}

export function UserMenu({ email }: Props) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" className="gap-2">
            <span className="max-w-[200px] truncate">{email}</span>
            <ChevronDown className="h-4 w-4" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          render={
            <Link href="/settings">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Link>
          }
        />
        <DropdownMenuItem
          onClick={() => {
            // After logout, land on the login page. withBase prefixes the
            // production sub-path (/language-learning) so we don't end up on
            // the business site root; in dev it resolves to '/login'.
            void signOut({ callbackUrl: withBase('/login') });
          }}
        >
          <LogOut className="mr-2 h-4 w-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
