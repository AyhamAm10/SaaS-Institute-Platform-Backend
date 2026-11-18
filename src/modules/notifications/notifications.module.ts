import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueNames } from '../../infrastructure/queue/queue-names';
import { InstitutesModule } from '../institutes/institutes.module';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { NotificationEventsService } from './notification-events.service';
import { StudyNotificationEventsService } from './study-notification-events.service';
import { NotificationRemindersService } from './notification-reminders.service';
import { NotificationsProcessor } from './notifications.processor';
import { PushSenderService } from './push-sender.service';
import { NotificationRepository } from './notification.repository';
import { DeviceTokenRepository } from './device-token.repository';
import { NotificationSettingRepository } from './notification-setting.repository';
import { NotificationAudienceRepository } from './notification-audience.repository';
import { NotificationRemindersRepository } from './notification-reminders.repository';
import { LessonRemindersService } from './lesson-reminders.service';
import { LessonRemindersRepository } from './lesson-reminders.repository';

/**
 * Notifications: in-app inbox, push (FCM) and the domain events that create
 * them. Domain modules import it and call the events services; it never
 * imports a domain module (no cycles).
 */
@Module({
  imports: [InstitutesModule, BullModule.registerQueue({ name: QueueNames.notifications })],
  controllers: [NotificationsController],
  providers: [
    NotificationsService,
    NotificationEventsService,
    StudyNotificationEventsService,
    NotificationRemindersService,
    NotificationsProcessor,
    PushSenderService,
    NotificationRepository,
    DeviceTokenRepository,
    NotificationSettingRepository,
    NotificationAudienceRepository,
    NotificationRemindersRepository,
    LessonRemindersService,
    LessonRemindersRepository,
  ],
  exports: [NotificationEventsService, StudyNotificationEventsService],
})
export class NotificationsModule {}
