export interface DocumentSnapshot { readonly source: string; readonly fileName: string }
export interface GuideStep { id: string; title: string; description: string; target: string; pane?: 'code'|'cascade' }
export interface PluginAction { id: string; label: string; title?: string; href?: string; run?: () => void|Promise<void> }
export interface PluginContext {
  readonly apiVersion: 1;
  readonly document: {
    read(): Readonly<DocumentSnapshot>;
    subscribe(listener: (document: Readonly<DocumentSnapshot>) => void): () => void;
  };
  readonly ui: {
    addAction(action: PluginAction): () => void;
    addGuideStep(step: GuideStep): () => void;
    notify(message: string): void;
  };
}
export interface EditorPlugin { setup(context: PluginContext): void|(() => void)|Promise<void|(() => void)> }
export interface PluginManifest { id: string; name: string; description: string; version: string; apiVersion: number; entry?: string; enabledByDefault?: boolean }
export interface PluginDescriptor { manifest: PluginManifest; managed?: boolean; load(): Promise<{ default: EditorPlugin }> }
