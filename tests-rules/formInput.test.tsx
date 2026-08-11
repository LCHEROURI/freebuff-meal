// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { z } from 'zod';

import { FormInput, FormTextarea } from '@/components/common/FormInput';
import { makeFieldUIAnnotations } from '@/lib/fieldUIAnnotations';

const schema = z.object({
  tags: z.string(),
  note: z.string(),
  name: z.string(),
});

const ui = makeFieldUIAnnotations(schema, {
  commaListFields: ['tags'],
  paragraphFields: ['note'],
});

describe('FormInput', () => {
  it('renders a text input with a label', () => {
    render(
      <FormInput
        fieldUI={ui}
        field="tags"
        label="Tags"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Tags')).toBeInTheDocument();
  });

  it('sets data-voice-separator for an annotated comma list field', () => {
    render(
      <FormInput
        fieldUI={ui}
        field="tags"
        label="Tags"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Tags');
    expect(input).toHaveAttribute('data-voice-separator', ', ');
  });

  it('sets data-voice-separator for an annotated paragraph field', () => {
    const ui2 = makeFieldUIAnnotations(schema, {
      paragraphFields: ['note'],
    });
    render(
      <FormInput
        fieldUI={ui2}
        field="note"
        label="Note"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Note');
    expect(input).toHaveAttribute('data-voice-separator', '\n');
  });

  it('does not set data-voice-separator for a non annotated field', () => {
    render(
      <FormInput
        fieldUI={ui}
        field="name"
        label="Name"
        onChange={() => {}}
      />,
    );
    const input = screen.getByLabelText('Name');
    expect(input).not.toHaveAttribute('data-voice-separator');
  });

  it('forwards the onChange handler', async () => {
    const user = userEvent.setup();
    let value = '';
    render(
      <FormInput
        fieldUI={ui}
        field="tags"
        label="Tags"
        onChange={(e) => { value = (e.target as HTMLInputElement).value; }}
      />,
    );
    const input = screen.getByLabelText('Tags');
    await user.type(input, 'chicken');
    expect(value).toBe('chicken');
  });

  it('shows an error message when provided', () => {
    render(
      <FormInput
        fieldUI={ui}
        field="tags"
        label="Tags"
        error="Required field"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Required field');
  });

  it('marks the input as required when the required prop is set', () => {
    render(
      <FormInput
        fieldUI={ui}
        field="tags"
        label="Tags"
        required
        onChange={() => {}}
      />,
    );
    const input = screen.getByRole('textbox', { name: /Tags/ });
    expect(input).toBeRequired();
  });
});

describe('FormTextarea', () => {
  it('renders a textarea with a label', () => {
    render(
      <FormTextarea
        fieldUI={ui}
        field="note"
        label="Notes"
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });

  it('sets data-voice-separator for an annotated paragraph field', () => {
    render(
      <FormTextarea
        fieldUI={ui}
        field="note"
        label="Notes"
        onChange={() => {}}
      />,
    );
    const textarea = screen.getByLabelText('Notes');
    expect(textarea).toHaveAttribute('data-voice-separator', '\n');
  });

  it('does not set data-voice-separator for a non annotated field', () => {
    render(
      <FormTextarea
        fieldUI={ui}
        field="name"
        label="Name"
        onChange={() => {}}
      />,
    );
    const textarea = screen.getByLabelText('Name');
    expect(textarea).not.toHaveAttribute('data-voice-separator');
  });

  it('forwards the onChange handler', async () => {
    const user = userEvent.setup();
    let value = '';
    render(
      <FormTextarea
        fieldUI={ui}
        field="note"
        label="Notes"
        onChange={(e) => { value = (e.target as HTMLTextAreaElement).value; }}
      />,
    );
    const textarea = screen.getByLabelText('Notes');
    await user.type(textarea, 'store in fridge');
    expect(value).toBe('store in fridge');
  });

  it('shows an error message when provided', () => {
    render(
      <FormTextarea
        fieldUI={ui}
        field="note"
        label="Notes"
        error="Too long"
        onChange={() => {}}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Too long');
  });
});
