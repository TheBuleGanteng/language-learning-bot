'use client';

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
} from 'react';
import { Keyboard } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { applyHotkeys, SPECIAL_CHAR_GROUPS } from '@/lib/special-chars';

interface SpecialInputProps
  extends Omit<ComponentProps<'input'>, 'value' | 'onChange'> {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Text input augmented for IPA/diacritic entry: inline hotkey replacement
 * (a` → ǎ, e6 → ɛ, …) while typing, plus a palette popover of clickable
 * special characters. See `@/lib/special-chars` for the scheme. Used for the
 * vocab search bar, the add/edit target + transliteration fields, and the
 * photo-extraction inline target edit.
 */
export function SpecialInput({
  value,
  onChange,
  className,
  ...rest
}: SpecialInputProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  function getInput(): HTMLInputElement | null {
    return containerRef.current?.querySelector('input') ?? null;
  }

  // Close the palette on outside click or Escape. Clicks inside the wrapper
  // (the char buttons) keep it open so several chars can be inserted in a row.
  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const el = e.currentTarget;
    const raw = el.value;
    const cursor = el.selectionStart ?? raw.length;
    const { text, cursorPos } = applyHotkeys(raw, cursor);
    onChange(text);
    if (text !== raw) {
      // A hotkey fired: restore the caret after React re-renders.
      requestAnimationFrame(() => el.setSelectionRange(cursorPos, cursorPos));
    }
  }

  function insertChar(ch: string) {
    const el = getInput();
    if (!el) {
      onChange(value + ch);
      return;
    }
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + ch + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      const pos = start + ch.length;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  }

  return (
    <div className="relative flex w-full gap-1" ref={containerRef}>
      <Input
        value={value}
        onChange={handleChange}
        className={className}
        autoComplete="off"
        {...rest}
      />
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        title="Special characters"
        aria-label="Insert special character"
        aria-expanded={open}
        // preventDefault keeps focus in the input so clicking the trigger never
        // blurs it (which would commit an inline edit before a char is inserted).
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          setOpen((v) => !v);
          getInput()?.focus();
        }}
      >
        <Keyboard className="h-4 w-4" />
      </Button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-80 space-y-3 rounded-lg border bg-popover p-3 text-popover-foreground shadow-md">
          {SPECIAL_CHAR_GROUPS.map((group) => (
            <div key={group.name}>
              <div className="mb-1 text-xs text-muted-foreground">{group.name}</div>
              <div className="flex flex-wrap gap-1">
                {group.chars.map((c) => (
                  <Button
                    key={c}
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    className="font-mono"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => insertChar(c)}
                  >
                    {c}
                  </Button>
                ))}
              </div>
            </div>
          ))}
          <div className="border-t pt-2 text-xs text-muted-foreground">
            Tip: type <code>a`</code> → <code>ǎ</code>, <code>a&apos;</code> →{' '}
            <code>á</code>, <code>a\</code> → <code>à</code>, <code>a^</code> →{' '}
            <code>â</code>, <code>e6</code> → <code>ɛ</code>
          </div>
        </div>
      )}
    </div>
  );
}
