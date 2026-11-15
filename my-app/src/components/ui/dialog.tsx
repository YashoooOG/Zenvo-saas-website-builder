'use client';

import { Dialog as BaseDialog } from '@base-ui/react/dialog';
import { X } from 'lucide-react';

export const Dialog = BaseDialog.Root;
export const DialogTrigger = BaseDialog.Trigger;
export const DialogClose = BaseDialog.Close;

export function DialogContent({ title, description, children, className = '', ...props }: {
  title: string; description: string; children: React.ReactNode;
} & BaseDialog.Popup.Props) {
  return <BaseDialog.Portal><BaseDialog.Backdrop className="workspace-dialog-backdrop" />
    <BaseDialog.Popup {...props} className={`workspace-dialog ${className}`}>
      <div className="workspace-dialog-heading"><BaseDialog.Title>{title}</BaseDialog.Title>
        <BaseDialog.Close className="workspace-icon-button" aria-label="Close dialog"><X size={20} aria-hidden="true" /></BaseDialog.Close></div>
      <BaseDialog.Description className="workspace-dialog-description">{description}</BaseDialog.Description>
      {children}
    </BaseDialog.Popup>
  </BaseDialog.Portal>;
}
