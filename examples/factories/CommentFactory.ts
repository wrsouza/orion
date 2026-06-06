import { Factory } from '../../../src';
import { Comment } from '../models/Comment';

export class CommentFactory extends Factory<Comment> {
  model = Comment;

  definition(): Record<string, unknown> {
    const idx = Math.floor(Math.random() * 10000);
    return {
      body:     `Comment number ${idx}. Great content!`,
      approved: true,
    };
  }

  pending(): this {
    return this.state({ approved: false });
  }
}
