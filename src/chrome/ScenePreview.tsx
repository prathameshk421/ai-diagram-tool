type Props = {
  value: unknown;
};

export function ScenePreview({ value }: Props) {
  return (
    <section className="preview scene-preview" aria-label="Scene JSON">
      <h2>Scene (agent view)</h2>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </section>
  );
}
