import { Resource } from '../../../src';
import { Post } from '../models/Post';

export class PostResource extends Resource<Post> {
  toArray(): Record<string, unknown> {
    return {
      id:          this.resource.id,
      title:       this.resource.title,
      slug:        this.resource.slug,
      status:      this.resource.status,
      view_count:  this.resource.view_count,

      // Computed accessors defined on the model
      excerpt:              (this.resource as any).excerpt,
      reading_time_minutes: (this.resource as any).readingTimeMinutes,

      // Author info — only when eager-loaded (prevents N+1)
      author: this.whenLoaded('author', () => {
        const author = this.resource.getRelation<any>('author');
        return { id: author?.id, name: author?._attributes?.name };
      }),

      // Counts — only when loaded via withCount()
      comments_count: this.whenCounted('comments'),

      // Tags — only when eager-loaded
      tags: this.whenLoaded('tags', () =>
        (this.resource.getRelation<any>('tags') ?? []).map((t: any) => ({
          id:   t._attributes.id,
          name: t._attributes.name,
          slug: t._attributes.slug,
        }))
      ),

      published_at: this.resource.published_at,
      created_at:   this.resource.created_at,
    };
  }
}
