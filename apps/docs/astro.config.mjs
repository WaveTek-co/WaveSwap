// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import mermaid from 'astro-mermaid';
import { ion } from './index.js';

// https://astro.build/config
export default defineConfig({
	integrations: [
		mermaid(),
		starlight({
			title: 'WaveTek Documentation',
			description: 'Privacy-Preserving Multi-Chain DEX Documentation',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/waveswap/waveswap' },
				{ icon: 'twitter', label: 'X (Twitter)', href: 'https://x.com/securethebagfun' },
			],
			sidebar: [
				{
					label: 'Getting Started',
					items: [
						{ label: 'Introduction', slug: 'guides/introduction' },
						{ label: 'Quick Start', slug: 'guides/quickstart' },
					],
				},
				{
					label: 'Products',
					items: [
						{ label: 'WaveSwap', slug: 'products/waveswap' },
					],
				},
				{
					label: 'Developers',
					items: [
						{ label: 'API Reference', slug: 'api/overview' },
						{ label: 'SDK Guide', slug: 'developers/sdk' },
					],
				},
				{
					label: 'Security',
					items: [
						{ label: 'Security Overview', slug: 'security/overview' },
					],
				},
			],
		}),
	],
	starlightPlugins: [
		ion({
			icons: {
				include: ['mdi', 'carbon', 'ic', 'tabler'],
			},
			footer: {
				text: '© 2025 WaveTek. Your swaps, your privacy. Built on Solana.',
				links: [
					{ text: 'WaveTek App', href: 'https://wavetek.io' },
					{ text: 'Main Site', href: 'https://securethebag.fun' },
					{ text: 'Privacy Policy', href: '/privacy' },
					{ text: 'Terms of Service', href: '/terms' },
				],
				icons: [
					{ name: 'mdi:github', href: 'https://github.com/waveswap/waveswap' },
					{ name: 'mdi:telegram', href: 'https://t.me/securethebagfun' },
					{ name: 'mdi:twitter', href: 'https://x.com/securethebagfun' },
				],
			},
		}),
	],
});