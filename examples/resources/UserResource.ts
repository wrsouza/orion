import { Resource } from '../../../src';
import { User } from '../models/User';
import { PostResource } from './PostResource';

export class UserResource extends Resource<User> {
  toArray(): Record<string, unknown> {
    return {
      id:    this.resource.id,
      name:  this.resource.name,
      email: this.resource.email,
      role:  this.resource.role,
      score: this.resource.score,

      // Computed accessor — included because @appends(['full_name']) is set on the model,
      // but we can also expose it explicitly here
      full_name: (this.resource as any).fullName,

      // Only include email_verified_at if the user is verified
      verified_at: this.when(
        this.resource.email_verified_at !== null,
        this.resource.email_verified_at,
      ),

      // Include profile only when it was eager-loaded
      profile: this.whenLoaded('profile', () => {
        const profile = this.resource.getRelation<any>('profile');
        return profile ? {
          avatar_url: profile._attributes.avatar_url,
          bio:        profile._attributes.bio,
          website:    profile._attributes.website,
        } : null;
      }),

      // Include posts only when eager-loaded
      posts: this.whenLoaded('posts', () =>
        PostResource.collection(this.resource.getRelation<any>('posts'))
      ),

      // Include posts_count only when it was loaded via withCount()
      posts_count: this.whenCounted('posts'),

      created_at: this.resource.created_at,
    };
  }

  // Top-level metadata added to every response from this resource
  with(): Record<string, unknown> {
    return { api_version: 1 };
  }
}
