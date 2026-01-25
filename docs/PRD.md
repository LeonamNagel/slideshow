# PRD - Slideshow Maker

## Visão Geral

**Produto:** Slideshow Maker
**Versão:** 1.0.0
**Data:** Janeiro 2026

### Resumo Executivo

O Slideshow Maker é uma aplicação web que permite aos usuários criar apresentações de fotos com efeitos cinematográficos profissionais, música de fundo e exportação para vídeo MP4. A aplicação roda inteiramente no navegador, sem necessidade de backend ou upload para servidores externos.

### Problema

Criar slideshows de fotos com qualidade profissional geralmente requer:
- Software de edição de vídeo complexo e caro
- Conhecimento técnico avançado
- Upload de arquivos para serviços de terceiros (questões de privacidade)
- Tempo significativo para aprender e executar

### Solução

Uma aplicação web simples e intuitiva que permite criar slideshows cinematográficos em minutos, com:
- Interface drag-and-drop
- Efeitos Ken Burns automáticos
- Processamento 100% local (privacidade garantida)
- Exportação direta para MP4

---

## Público-Alvo

### Usuários Primários
- **Usuários casuais:** Pessoas que querem criar vídeos de memórias (viagens, aniversários, casamentos)
- **Pequenos criadores de conteúdo:** YouTubers e influenciadores que precisam de intros/outros rápidos
- **Profissionais de marketing:** Criação rápida de conteúdo visual para redes sociais

### Personas

**Maria, 35 anos - Mãe de família**
- Quer criar vídeos das fotos de férias para compartilhar com a família
- Não tem conhecimento técnico em edição de vídeo
- Valoriza simplicidade e rapidez

**João, 28 anos - Criador de conteúdo**
- Precisa criar slideshows para seus vídeos do YouTube
- Busca efeitos profissionais sem software complexo
- Valoriza qualidade e privacidade dos arquivos

---

## Funcionalidades

### 1. Upload e Gerenciamento de Fotos

| Funcionalidade | Descrição | Prioridade |
|----------------|-----------|------------|
| Upload múltiplo | Selecionar várias fotos de uma vez | P0 |
| Drag and drop | Arrastar fotos diretamente para o app | P0 |
| Preview em grid | Visualizar todas as fotos adicionadas | P0 |
| Reordenação | Arrastar para mudar a ordem das fotos | P0 |
| Remoção individual | Remover fotos específicas | P0 |
| Limpar todas | Remover todas as fotos de uma vez | P1 |

**Formatos suportados:** JPG, PNG, GIF, WebP

### 2. Configurações do Slideshow

| Configuração | Descrição | Valores | Padrão |
|--------------|-----------|---------|--------|
| Duração por foto | Tempo de exibição de cada foto | 1-10 segundos | 3s |
| Duração da transição | Tempo do efeito de transição | 200-1500ms | 500ms |
| Efeito de transição | Tipo de animação entre fotos | 13 opções | Cinematico |
| Loop | Repetir slideshow ao final | On/Off | On |

### 3. Efeitos de Transição

#### Efeitos Cinematográficos (Recomendados)
| Efeito | Descrição |
|--------|-----------|
| **Cinematico** | Ken Burns com variações automáticas - cada foto recebe animação diferente |
| **Ken Burns** | Zoom e pan suave estilo documentário |
| **Flutuante** | Movimento sutil e delicado |
| **Respiração** | Zoom pulsante suave |

#### Efeitos Básicos
- Fade
- Deslizar (4 direções)
- Zoom In/Out
- Virar (Flip)
- Blur

### 4. Música de Fundo

| Funcionalidade | Descrição |
|----------------|-----------|
| Upload de áudio | Adicionar arquivo de música |
| Preview | Ouvir durante o slideshow |
| Troca de música | Substituir música atual |
| Remoção | Remover música |

**Formatos suportados:** MP3, WAV, OGG, M4A

### 5. Player de Slideshow

| Funcionalidade | Descrição |
|----------------|-----------|
| Play/Pause | Controlar reprodução |
| Anterior/Próximo | Navegar entre slides |
| Stop | Parar e voltar ao início |
| Tela cheia | Modo fullscreen |
| Barra de progresso | Indicador visual do tempo |
| Miniaturas | Strip de thumbnails clicáveis |
| Contador | Indicador de slide atual |

**Atalhos de teclado:**
- `Espaço`: Play/Pause
- `←` `→`: Navegar slides
- `ESC`: Sair da tela cheia

### 6. Exportação para Vídeo

| Especificação | Valor |
|---------------|-------|
| Formato | MP4 (H.264) |
| Resolução | 1920x1080 (Full HD) |
| FPS | 30 |
| Codec de vídeo | libx264 |
| Codec de áudio | AAC 192kbps |
| Processamento | 100% local (FFmpeg.wasm) |

**Fluxo de exportação:**
1. Carregamento do codificador
2. Renderização frame-by-frame
3. Codificação do vídeo
4. Download automático

---

## Requisitos Técnicos

### Stack Tecnológico

| Camada | Tecnologia |
|--------|------------|
| Framework | React 18 |
| Linguagem | TypeScript |
| Build Tool | Vite |
| Estilização | CSS3 (Catppuccin theme) |
| Codificação de vídeo | FFmpeg.wasm |

### Requisitos do Navegador

| Requisito | Mínimo |
|-----------|--------|
| Chrome | 89+ |
| Firefox | 89+ |
| Safari | 15+ |
| Edge | 89+ |
| SharedArrayBuffer | Necessário |

### Performance

| Métrica | Target |
|---------|--------|
| First Contentful Paint | < 1.5s |
| Time to Interactive | < 3s |
| Bundle size (gzip) | < 100KB (sem FFmpeg) |

---

## Arquitetura

```
src/
├── components/
│   ├── PhotoUpload.tsx      # Upload e grid de fotos
│   ├── Controls.tsx         # Painel de configurações
│   ├── SlideshowPlayer.tsx  # Player principal
│   └── ExportModal.tsx      # Modal de exportação
├── hooks/
│   ├── useSlideshow.ts      # Estado e lógica do slideshow
│   └── useVideoExport.ts    # Lógica de exportação
├── types/
│   └── index.ts             # Definições TypeScript
└── styles/
    ├── PhotoUpload.css
    ├── Controls.css
    ├── SlideshowPlayer.css
    └── ExportModal.css
```

### Fluxo de Dados

```
┌─────────────────┐
│   PhotoUpload   │──── addPhotos() ────┐
└─────────────────┘                     │
                                        ▼
┌─────────────────┐              ┌─────────────┐
│    Controls     │──settings───▶│ useSlideshow│
└─────────────────┘              │   (state)   │
                                 └──────┬──────┘
                                        │
┌─────────────────┐                     │
│ SlideshowPlayer │◀────────────────────┘
└─────────────────┘
        │
        ▼ exportVideo()
┌─────────────────┐
│ useVideoExport  │───▶ FFmpeg.wasm ───▶ MP4
└─────────────────┘
```

---

## Segurança e Privacidade

### Princípios
- **Zero upload:** Nenhum arquivo é enviado para servidores externos
- **Processamento local:** Todo o processamento ocorre no navegador do usuário
- **Sem tracking:** Nenhum dado de uso é coletado
- **Sem cookies:** Aplicação stateless

### Considerações
- Arquivos são armazenados temporariamente em Object URLs
- URLs são revogados quando não mais necessários
- Nenhum dado persiste após fechar o navegador

---

## Roadmap Futuro

### Versão 1.1
- [ ] Seleção de resolução de exportação (720p, 1080p, 4K)
- [ ] Mais efeitos de transição
- [ ] Texto/legendas sobre as fotos
- [ ] Filtros de imagem (sépia, P&B, etc)

### Versão 1.2
- [ ] Templates prontos
- [ ] Sincronização com batida da música
- [ ] Preview em tempo real da exportação
- [ ] Suporte a vídeos como entrada

### Versão 2.0
- [ ] PWA (Progressive Web App)
- [ ] Modo offline
- [ ] Salvar projetos localmente
- [ ] Compartilhamento direto para redes sociais

---

## Métricas de Sucesso

| Métrica | Target |
|---------|--------|
| Tempo médio para criar slideshow | < 5 minutos |
| Taxa de conclusão de exportação | > 95% |
| Satisfação do usuário (NPS) | > 50 |
| Taxa de retenção semanal | > 30% |

---

## Limitações Conhecidas

1. **Primeira exportação lenta:** Download do FFmpeg.wasm (~30MB) na primeira vez
2. **Consumo de memória:** Slideshows muito grandes podem consumir muita RAM
3. **Compatibilidade:** Requer navegadores modernos com suporte a SharedArrayBuffer
4. **Áudio em loop:** Música é repetida se for mais curta que o slideshow

---

## Glossário

| Termo | Definição |
|-------|-----------|
| Ken Burns | Técnica de pan e zoom em fotos estáticas, popularizada pelo documentarista Ken Burns |
| FFmpeg | Software de código aberto para processamento de áudio e vídeo |
| WASM | WebAssembly - formato binário para execução de código nativo no navegador |
| Crossfade | Transição suave onde uma imagem desaparece enquanto outra aparece |

---

*Documento criado em Janeiro 2026*
*Última atualização: Janeiro 2026*
