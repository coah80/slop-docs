// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

export default defineConfig({
	site: 'https://coah80.github.io',
	base: '/slop-docs',
	integrations: [
		starlight({
			title: 'Slop Docs',
			components: {
				Banner: './src/components/Banner.astro',
			},
			favicon: '/favicon.png',
			head: [
				{ tag: 'link', attrs: { rel: 'icon', href: '/slop-docs/favicon.png', type: 'image/png' } },
				{ tag: 'meta', attrs: { property: 'og:image', content: 'https://coah80.github.io/slop-docs/og-image.png' } },
				{ tag: 'meta', attrs: { name: 'twitter:image', content: 'https://coah80.github.io/slop-docs/og-image.png' } },
			],
			social: [
				{ icon: 'github', label: 'Docs GitHub', href: 'https://github.com/coah80/slop-docs' },
				{ icon: 'seti:git', label: 'neoLegacy Source', href: 'https://git.neolegacy.dev/coah80/neoLegacy' },
			],
			sidebar: [
				{
					label: 'Overview',
					items: [
						{ label: 'Introduction', slug: 'overview/introduction' },
						{ label: 'Architecture', slug: 'overview/architecture' },
						{ label: 'Building & Compiling', slug: 'overview/building' },
						{ label: 'Contributing & Releases', slug: 'overview/contributing' },
						{ label: 'Glossary', slug: 'overview/glossary' },
					],
				},
				{
					label: 'Minecraft.World',
					items: [
						{ label: 'Overview', slug: 'world/overview' },
						{ label: 'Blocks (Tiles)', slug: 'world/blocks' },
						{ label: 'Items', slug: 'world/items' },
						{ label: 'Entities', slug: 'world/entities' },
						{ label: 'Block Entities', slug: 'world/tile-entities' },
						{ label: 'AI & Goals', slug: 'world/ai-goals' },
						{ label: 'World Generation', slug: 'world/worldgen' },
						{ label: 'Biomes', slug: 'world/biomes' },
						{ label: 'Structures & Features', slug: 'world/structures' },
						{ label: 'Dimensions', slug: 'world/dimensions' },
						{ label: 'Enchantments', slug: 'world/enchantments' },
						{ label: 'Effects & Potions', slug: 'world/effects' },
						{ label: 'Crafting & Recipes', slug: 'world/crafting' },
						{ label: 'Container Menus', slug: 'world/containers' },
						{ label: 'Redstone', slug: 'world/redstone' },
						{ label: 'Networking & Packets', slug: 'world/networking' },
						{ label: 'Level Storage & IO', slug: 'world/storage' },
						{ label: 'Game Rules', slug: 'world/gamerules' },
						{ label: 'Materials', slug: 'world/materials' },
						{ label: 'Commands', slug: 'world/commands' },
					],
				},
				{
					label: 'Minecraft.Client',
					items: [
						{ label: 'Overview', slug: 'client/overview' },
						{ label: 'Rendering Pipeline', slug: 'client/rendering' },
						{ label: 'Entity Renderers & Models', slug: 'client/entity-rendering' },
						{ label: 'Particles', slug: 'client/particles' },
						{ label: 'UI System (UIScene & XUI)', slug: 'client/ui-system' },
						{ label: 'Classic Screens & HUD', slug: 'client/screens' },
						{ label: 'Input', slug: 'client/input' },
						{ label: 'Texture Packs & Resources', slug: 'client/resources' },
						{ label: 'Audio', slug: 'client/audio' },
						{ label: 'Settings & Options', slug: 'client/settings' },
						{ label: 'Achievements & Stats', slug: 'client/achievements' },
						{ label: 'Multiplayer & Networking', slug: 'client/networking' },
						{ label: 'Tutorial, DLC & Console Systems', slug: 'client/consoles-systems' },
					],
				},
				{
					label: 'Platform Code',
					items: [
						{ label: 'Overview', slug: 'platforms/overview' },
						{ label: 'Windows 64', slug: 'platforms/windows64' },
						{ label: 'Xbox 360 & Xbox One', slug: 'platforms/xbox' },
						{ label: 'PS3, PS4 & PS Vita', slug: 'platforms/playstation' },
					],
				},
				{
					label: 'Dedicated Server',
					items: [
						{ label: 'Overview', slug: 'server/overview' },
						{ label: 'Configuration', slug: 'server/configuration' },
						{ label: 'Console & CLI', slug: 'server/console' },
						{ label: 'Deployment', slug: 'server/deployment' },
						{ label: 'FourKit Plugin System', slug: 'server/fourkit' },
						{ label: 'Writing FourKit Plugins', slug: 'server/fourkit-plugins' },
					],
				},
				{
					label: 'neoLegacy Features',
					items: [
						{ label: 'TU25 Backport', slug: 'features/tu25' },
						{ label: 'TU31 Backport', slug: 'features/tu31' },
						{ label: 'neoLegacy Additions', slug: 'features/neolegacy-additions' },
						{ label: 'Version History', slug: 'features/changelog' },
					],
				},
				{
					label: 'Backporting Guide',
					items: [
						{ label: 'How neoLegacy Backports', slug: 'backporting/overview' },
						{ label: 'Case Studies', slug: 'backporting/case-studies' },
						{ label: 'Backporting Workflow', slug: 'backporting/workflow' },
					],
				},
				{
					label: 'Modding Guide',
					items: [
						{ label: 'Getting Started', slug: 'modding/getting-started' },
						{
							label: 'Blocks & World',
							items: [
								{ label: 'Adding Blocks', slug: 'modding/adding-blocks' },
								{ label: 'Adding Biomes', slug: 'modding/adding-biomes' },
								{ label: 'Custom World Generation', slug: 'modding/custom-worldgen' },
								{ label: 'Custom Structures', slug: 'modding/custom-structures' },
								{ label: 'Custom Dimensions', slug: 'modding/custom-dimensions' },
							],
						},
						{
							label: 'Items & Crafting',
							items: [
								{ label: 'Adding Items', slug: 'modding/adding-items' },
								{ label: 'Adding Recipes', slug: 'modding/adding-recipes' },
								{ label: 'Custom Enchantments', slug: 'modding/custom-enchantments' },
								{ label: 'Custom Potions & Effects', slug: 'modding/custom-potions' },
							],
						},
						{
							label: 'Entities & AI',
							items: [
								{ label: 'Adding Entities', slug: 'modding/adding-entities' },
								{ label: 'Custom AI Behaviors', slug: 'modding/custom-ai' },
							],
						},
						{
							label: 'UI & Assets',
							items: [
								{ label: 'Textures & Asset Pipeline', slug: 'modding/textures-assets' },
								{ label: 'Custom UI Scenes', slug: 'modding/custom-ui' },
								{ label: 'Custom Container Menus', slug: 'modding/custom-containers' },
								{ label: 'Custom Particles', slug: 'modding/custom-particles' },
								{ label: 'Custom Sounds & Music', slug: 'modding/custom-sounds' },
							],
						},
						{
							label: 'Gameplay & Systems',
							items: [
								{ label: 'Adding Commands', slug: 'modding/adding-commands' },
								{ label: 'Custom Game Rules', slug: 'modding/custom-gamerules' },
								{ label: 'Multiplayer & Packets', slug: 'modding/multiplayer-packets' },
							],
						},
					],
				},
				{
					label: 'Mods',
					items: [
						{ label: 'Mods & Distribution', slug: 'mods/overview' },
						{ label: 'FourKit Plugins', slug: 'mods/fourkit-ecosystem' },
					],
				},
				{
					label: 'Tools & Infrastructure',
					items: [
						{ label: 'Repo Tools', slug: 'tools/repo-tools' },
						{ label: 'Performance & Stress Testing', slug: 'tools/testing' },
						{ label: 'CI & Release Pipeline', slug: 'tools/ci' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'Block (Tile) ID Registry', slug: 'reference/block-ids' },
						{ label: 'Item ID Registry', slug: 'reference/item-ids' },
						{ label: 'Entity Type Registry', slug: 'reference/entity-types' },
						{ label: 'Packet ID Registry', slug: 'reference/packet-ids' },
						{ label: 'Enchantment & Effect IDs', slug: 'reference/enchantment-effect-ids' },
						{ label: 'server.properties Reference', slug: 'reference/server-properties' },
						{ label: 'FourKit Event Reference', slug: 'reference/fourkit-events' },
					],
				},
			],
		}),
	],
});
