/**
 * PantryMicButton (PR #43) — ambient voice pantry input.
 *
 * Mini three-state machine:
 *   IDLE → tap → LISTENING → tap or auto-close → PREVIEW → tap save → SAVED
 *
 * Three deliberate design choices:
 *
 *  1. **Live preview chips, not auto-commit.** Hands are wet in the
 *     kitchen; relying on silence detection is fragile (fan noise,
 *     other people talking, the user thinking aloud before they
 *     mean to commit). The cook taps "Save" to commit — or "×" to
 *     remove a row they changed their mind about.
 *
 *  2. **Two-step write**: extract all items in one onCall
 *     (`extractIngredientsFromSpeech` — already exists), then
 *     upsert them in one batch (`addPantryItems`). Lower round-trip
 *     count and the strip gets one final-consistency refresh.
 *
 *  3. **Re-render-friendly** — the capture state lives at the
 *     component level, not in a context. Mounting it 3× across the
 *     app stays cheap because each instance is ~5 hooks.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic, MicOff, Save, X, Pencil } from 'lucide-react';

import { Button } from '@/components/common/Button';
import { useToast } from '@/components/common/Toast';
import { useSpeechDictation } from '@/lib/useSpeech';
import { FormTextarea } from '@/components/common/FormInput';
import { VoiceInputButton } from '@/components/common/VoiceInputButton';
import { pantryFieldUI } from '@/lib/fieldUI';

import { agentClient } from './agentClient';
import type { PantryItem } from './agentTypes';

type CaptureStatus = 'idle' | 'listening' | 'preview' | 'saving';

type PreviewRow = {
  key: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  condition: PantryItem['condition'];
  confidence: number;
  note: string;
};

export type PantryMicButtonProps = {
  uid: string | null;
  /** Caller-provided write path. The strip in the same component
   *  tree passes the `add` it received from `usePantryItems`.
   *  Without this, the button writes through `agentClient` directly
   *  and relies on the Firestore listener to refresh the strip. */
  onSave?: (rows: PreviewRow[]) => Promise<void> | void;
  className?: string;
};

const newPreviewKey = (): string => `pv_${Math.random().toString(36).slice(2, 10)}`;

export const PantryMicButton = ({
  uid,
  onSave,
  className = '',
}: PantryMicButtonProps) => {
  const toast = useToast();
  const {
    start: startSpeech,
    stop: stopSpeech,
    toggle,
    finalTranscript,
    reset: resetSpeech,
    listening,
    supported,
    error: speechError,
  } = useSpeechDictation();

  const [status, setStatus] = useState<CaptureStatus>('idle');
  const [preview, setPreview] = useState<PreviewRow[]>([]);
  const [editingNoteKey, setEditingNoteKey] = useState<string | null>(null);

  // Whenever the cook commits a final utterance chunk, pipe it
  // through the existing extractor. We accumulate results into the
  // preview strip; the cook taps "Save" to commit them all.
  useEffect(() => {
    if (!listening) return;
    if (finalTranscript.trim().length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const out = await agentClient.extractIngredientsFromSpeech(finalTranscript.trim());
        if (cancelled) return;
        const rows: PreviewRow[] = out.ingredients.map((i) => ({
          key: newPreviewKey(),
          name: i.name,
          quantity: i.quantity,
          unit: i.unit,
          condition: i.condition,
          confidence: i.confidence,
          note: '',
        }));
        if (rows.length === 0) return;
        setPreview((prev) => dedupePreview([...prev, ...rows]));
      } catch (err) {
        if (cancelled) return;
        toast.push({
          kind: 'error',
          title: 'Could not understand that',
          description: err instanceof Error ? err.message : 'Try speaking again.',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [finalTranscript, listening, toast]);

  const beginListening = useCallback(() => {
    if (!supported) {
      toast.push({
        kind: 'error',
        title: 'Voice input not supported',
        description:
          'Your browser does not support speech recognition. You can still type ingredients into your pantry by hand.',
      });
      return;
    }
    if (!uid) {
      toast.push({
        kind: 'info',
        title: 'Sign in to save',
        description: 'Pantry items only persist for signed-in cooks.',
      });
    }
    resetSpeech();
    setPreview([]);
    setEditingNoteKey(null);
    setStatus('listening');
    startSpeech();
  }, [supported, uid, resetSpeech, startSpeech, toast]);

  const stopListening = useCallback(() => {
    stopSpeech();
    setStatus((prev) => (prev === 'listening' ? 'preview' : prev));
  }, [stopSpeech]);

  const onToggle = useCallback(() => {
    if (status === 'listening') {
      stopListening();
      return;
    }
    toggle();
    if (!listening) {
      setStatus('listening');
    } else {
      setStatus((prev) => (prev === 'listening' ? 'preview' : prev));
    }
  }, [status, listening, toggle, stopListening]);

  const onSaveAll = useCallback(async () => {
    if (preview.length === 0) return;
    setStatus('saving');
    try {
      if (onSave) {
        await onSave(preview);
      } else {
        await agentClient.addPantryItems({
          items: preview.map((p) => ({
            name: p.name,
            quantity: p.quantity,
            unit: p.unit,
            condition: p.condition,
            confidence: p.confidence,
            note: p.note.trim() || undefined,
          })),
          source: 'voice',
        });
      }
      toast.push({
        kind: 'success',
        title: 'Pantry updated',
        description: `${preview.length} item${preview.length === 1 ? '' : 's'} added.`,
      });
      setPreview([]);
      resetSpeech();
      setStatus('idle');
      setEditingNoteKey(null);
    } catch (err) {
      setStatus('preview');
      toast.push({
        kind: 'error',
        title: 'Could not save to your pantry',
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  }, [preview, onSave, toast, resetSpeech]);

  const onCancelAll = useCallback(() => {
    setPreview([]);
    resetSpeech();
    setStatus('idle');
    setEditingNoteKey(null);
  }, [resetSpeech]);

  const onRemoveRow = useCallback((key: string) => {
    setPreview((prev) => prev.filter((p) => p.key !== key));
    if (editingNoteKey === key) setEditingNoteKey(null);
  }, [editingNoteKey]);

  const onNoteChange = useCallback((key: string, note: string) => {
    setPreview((prev) =>
      prev.map((p) => (p.key === key ? { ...p, note } : p)),
    );
  }, []);

  // Surface SR-friendly status changes.
  const ariaLabel = useMemo(() => {
    switch (status) {
      case 'listening':
        return 'Stop voice pantry input';
      case 'preview':
        return 'Voice pantry input in review';
      case 'saving':
        return 'Saving pantry items';
      default:
        return 'Add items to pantry by voice';
    }
  }, [status]);

  if (!supported) return null;

  const listeningPulse =
    status === 'listening'
      ? 'bg-tomato-100 text-tomato-600 ring-2 ring-tomato-500 listening-pulse'
      : 'text-pepper-500 hover:bg-butter-100 hover:text-tomato-600';

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-label={ariaLabel}
          aria-pressed={status === 'listening'}
          data-testid="pantry-mic-button"
          onClick={onToggle}
          className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors ${listeningPulse}`}
          title={
            status === 'listening'
              ? 'Tap to stop and review'
              : 'Tell me what you have on hand'
          }
        >
          {status === 'listening' ? (
            <MicOff size={16} aria-hidden="true" />
          ) : (
            <Mic size={16} aria-hidden="true" />
          )}
        </button>
        <span className="text-xs text-ink-700" aria-live="polite">
          {status === 'listening'
            ? 'Listening… speak what you have on hand'
            : status === 'preview'
              ? `${preview.length} item${preview.length === 1 ? '' : 's'} ready`
              : status === 'saving'
                ? 'Saving…'
                : 'Voice pantry'}
        </span>
        {speechError && (
          <span className="text-xs text-tomato-600">{speechError}</span>
        )}
        {!listening && status === 'idle' && (
          <Button size="sm" variant="secondary" onClick={beginListening}>
            Add to pantry by voice
          </Button>
        )}
      </div>

      {preview.length > 0 && (
        <div
          role="region"
          aria-label="Pantry preview"
          className="rounded-lg border border-butter-300 bg-butter-50 p-3"
        >
          <p className="text-xs font-medium text-ink-700">
            Confirm what we heard
          </p>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {preview.map((p) => (
              <li
                key={p.key}
                className="rounded-lg bg-flour-100 px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-1">
                  <span className="font-medium">{p.name}</span>
                  {p.condition && (
                    <span className="text-ink-500">({p.condition})</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Edit note for ${p.name}`}
                    title="Add a note"
                    className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-400 hover:text-ink-700"
                    onClick={() =>
                      setEditingNoteKey(
                        editingNoteKey === p.key ? null : p.key,
                      )
                    }
                  >
                    <Pencil size={10} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remove ${p.name}`}
                    className="ml-auto inline-flex h-4 w-4 items-center justify-center rounded-full text-ink-500 hover:bg-tomato-100 hover:text-tomato-700"
                    onClick={() => onRemoveRow(p.key)}
                  >
                    <X size={10} aria-hidden="true" />
                  </button>
                </div>
                {p.note && editingNoteKey !== p.key && (
                  <p className="mt-1 text-ink-500 italic">“{p.note}”</p>
                )}
                {editingNoteKey === p.key && (
                  <div data-voice-host className="mt-2">
                    <FormTextarea
                      fieldUI={pantryFieldUI}
                      field="note"
                      aria-label={`Note for ${p.name}`}
                      rows={2}
                      value={p.note}
                      onChange={(e) =>
                        onNoteChange(p.key, e.target.value)
                      }
                      className="text-xs"
                    />
                    <div className="mt-1 flex justify-end">
                      <VoiceInputButton />
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="primary"
              onClick={onSaveAll}
              disabled={status === 'saving'}
              leftIcon={<Save size={14} aria-hidden="true" />}
            >
              {status === 'saving'
                ? 'Saving…'
                : `Save ${preview.length} item${preview.length === 1 ? '' : 's'}`}
            </Button>
            <Button size="sm" variant="ghost" onClick={onCancelAll}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

const dedupePreview = (rows: PreviewRow[]): PreviewRow[] => {
  const seen = new Set<string>();
  const out: PreviewRow[] = [];
  for (const r of rows) {
    const key = `${r.name.toLowerCase().trim()}|${r.condition ?? 'unspecified'}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
};
