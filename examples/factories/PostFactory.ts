import { Factory, Sequence } from '../../../src';
import { Post } from '../models/Post';

export class PostFactory extends Factory<Post> {
  model = Post;

  definition(): Record<string, unknown> {
    const idx = Math.floor(Math.random() * 10000);
    return {
      title:        `Post Title ${idx}`,
      slug:         `post-title-${idx}`,
      body:         `This is the body of post ${idx}. `.repeat(30),
      status:       'published',
      view_count:   0,
      published_at: new Date(),
    };
  }

  draft(): this {
    return this.state({ status: 'draft', published_at: null });
  }

  archived(): this {
    return this.state({ status: 'archived' });
  }

  popular(views = 5000): this {
    return this.state({ view_count: views });
  }

  // Alternate between published and draft using Sequence
  alternating(): this {
    return this.state(new Sequence(
      { status: 'published', published_at: new Date() },
      { status: 'draft',     published_at: null },
    ));
  }
}
