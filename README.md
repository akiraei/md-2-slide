# md-slide

Structured Markdown to 16:9 PPTX generator.

`md-slide` treats Markdown as a slide blueprint, not as final visual design. The
Markdown describes slide titles, visible content, diagrams, and speaker notes;
the generator lays them out as a readable 16:9 PowerPoint deck.

## Usage

Install dependencies:

```bash
npm install
```

Validate a Markdown file:

```bash
npm run validate
```

Build a PPTX:

```bash
npm run build
```

Or call the CLI directly:

```bash
node src/cli.js validate input.md
node src/cli.js build input.md --out deck.pptx
```

Speaker notes are also written to a sibling `.notes.md` file next to the
generated deck.

## Input Markdown

Each slide should follow this structure:

~~~md
# 슬라이드 00. 슬라이드 이름

## 화면 제목
청중이 바로 이해할 수 있는 짧은 제목

## 화면 내용
슬라이드에 실제로 보일 핵심 문장 또는 항목

## 화면 구성
```mermaid
flowchart LR
  A[브라우저] -->|요청| B[서버]
  B -->|응답| A
```

## 발표 메모
강사가 말로 설명할 내용
~~~

Allowed Mermaid diagram types:

- `flowchart`
- `kanban`
- `timeline`
- `sequenceDiagram`
- `mindmap`

See [docs/writing-markdown.md](docs/writing-markdown.md) for the full Markdown
writing guide, including slide structure, Mermaid selection rules, and stability
guidelines.
