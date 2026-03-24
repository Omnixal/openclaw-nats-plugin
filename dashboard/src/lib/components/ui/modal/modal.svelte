<script lang="ts">
  import { Button } from '$lib/components/ui/button';
  import type { Snippet } from 'svelte';

  interface Props {
    open: boolean;
    title: string;
    onClose: () => void;
    children: Snippet;
    actions?: Snippet;
    class?: string;
  }

  let {
    open,
    title,
    onClose,
    children,
    actions,
    class: className,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    onkeydown={handleKeydown}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="fixed inset-0" onclick={onClose}></div>
    <div class="relative z-10 w-full {className ?? 'max-w-lg'} rounded-lg border bg-background p-6 shadow-lg">
      <div class="flex items-center justify-between mb-4">
        <h3 class="text-lg font-semibold">{title}</h3>
        <Button variant="ghost" size="icon-sm" onclick={onClose}>
          <span class="text-lg leading-none">&times;</span>
        </Button>
      </div>
      {@render children()}
      {#if actions}
        <div class="mt-4 flex justify-end gap-2">
          {@render actions()}
        </div>
      {/if}
    </div>
  </div>
{/if}
