import { IsIn } from 'class-validator';
import {
  RECOMMENDATION_FEEDBACK_ACTIONS,
  type RecommendationFeedbackAction,
} from '../schemas/recommendation-feedback.schema';

export class RecommendationFeedbackDto {
  @IsIn(RECOMMENDATION_FEEDBACK_ACTIONS)
  action!: RecommendationFeedbackAction;
}
