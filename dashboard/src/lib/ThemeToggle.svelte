<script lang="ts">
  import { onMount } from 'svelte';
  import Monitor from '@lucide/svelte/icons/monitor';
  import Moon from '@lucide/svelte/icons/moon';
  import Sun from '@lucide/svelte/icons/sun';

  type Theme = 'system' | 'dark' | 'light';

  let theme: Theme = $state('system');

  const modes: { id: Theme; icon: typeof Monitor; label: string }[] = [
    { id: 'system', icon: Monitor, label: 'System' },
    { id: 'dark', icon: Moon, label: 'Dark' },
    { id: 'light', icon: Sun, label: 'Light' },
  ];

  function apply(t: Theme) {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = t === 'dark' || (t === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }

  function setTheme(t: Theme) {
    theme = t;
    localStorage.setItem('nats-theme', t);
    apply(t);
  }

  onMount(() => {
    const saved = localStorage.getItem('nats-theme') as Theme | null;
    theme = saved && ['system', 'dark', 'light'].includes(saved) ? saved : 'system';
    apply(theme);

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { if (theme === 'system') apply('system'); };
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  });
</script>

<div class="flex items-center gap-0.5 rounded-lg bg-secondary p-0.5">
  {#each modes as mode}
    <button
      class="inline-flex items-center justify-center rounded-md p-1.5 transition-colors
        {theme === mode.id
          ? 'bg-accent text-foreground shadow-sm'
          : 'text-muted-foreground hover:text-foreground'}"
      onclick={() => setTheme(mode.id)}
      title={mode.label}
    >
      <mode.icon size={14} />
    </button>
  {/each}
</div>
